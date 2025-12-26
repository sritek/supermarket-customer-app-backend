import { Response } from "express";
import Order, { IOrderItem } from "../models/Order";
import Cart from "../models/Cart";
import Product from "../models/Product";
import Address, { IAddress } from "../models/Address";
import Razorpay from "razorpay";
import { AuthRequest } from "../middlewares/auth";
import { getRazorpay } from "../utils/razorpay";

// const razorpay = new Razorpay({
//   key_id: process.env.RAZORPAY_KEY_ID || "",
//   key_secret: process.env.RAZORPAY_KEY_SECRET || "",
// });

const TAX_RATE = 0.18; // 18% GST
const DELIVERY_FEE = 50; // ₹50 delivery fee

export const createOrder = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { addressId, paymentMethod, razorpayOrderId, razorpayPaymentId } =
      req.body;

    if (!addressId || !paymentMethod) {
      res
        .status(400)
        .json({ success: false, error: "Address and payment method required" });
      return;
    }

    // For Razorpay, verify payment details are provided
    if (
      paymentMethod === "razorpay" &&
      (!razorpayOrderId || !razorpayPaymentId)
    ) {
      res
        .status(400)
        .json({ success: false, error: "Razorpay payment details required" });
      return;
    }

    // Get cart (without populate - products are in different DB)
    const cart = await Cart.findOne({ user: req.user?._id });

    if (!cart || cart.items.length === 0) {
      res.status(400).json({ success: false, error: "Cart is empty" });
      return;
    }

    // Verify address
    const address = await Address.findOne({
      _id: addressId,
      user: req.user?._id,
    });

    if (!address) {
      res.status(404).json({ success: false, error: "Address not found" });
      return;
    }

    // Manually populate products from admin DB (populate doesn't work across DBs)
    const cartObj = cart.toObject ? cart.toObject() : { ...cart };
    const productIds = cartObj.items.map((item: any) => item.product);

    // Fetch products from admin DB
    const products = await Product.find({
      _id: { $in: productIds },
      status: "ACTIVE",
    }).select("_id name price images stock sku unit brand");

    // Create a map of productId -> product for quick lookup
    const productMap = new Map();
    products.forEach((product: any) => {
      const productObj = product.toObject ? product.toObject() : product;
      productMap.set(productObj._id.toString(), productObj);
    });

    // Calculate totals
    let subtotal = 0;
    const orderItems: IOrderItem[] = [];

    for (const item of cartObj.items) {
      const productId = item.product.toString();
      const product = productMap.get(productId);

      if (!product) {
        res.status(400).json({
          success: false,
          error: `Product not found for item in cart`,
        });
        return;
      }

      // Admin DB uses 'stock' field, but virtual provides 'stockQuantity' for compatibility
      const availableStock = product.stock || product.stockQuantity || 0;
      if (availableStock < item.quantity) {
        res.status(400).json({
          success: false,
          error: `Insufficient stock for ${product.name}`,
        });
        return;
      }

      const itemTotal = product.price * item.quantity;
      subtotal += itemTotal;

      orderItems.push({
        product: product._id,
        name: product.name,
        price: product.price,
        quantity: item.quantity,
        image: product.images?.[0],
      });

      // NOTE: Customer app should NOT update stock directly (read-only access)
      // Stock updates should be handled by admin backend when order status changes
      // For now, we'll skip stock update to maintain read-only access
      // TODO: Implement stock update via admin API or trigger admin backend to update
    }

    const tax = subtotal * TAX_RATE;
    const deliveryFee = subtotal >= 500 ? 0 : DELIVERY_FEE; // Free delivery above ₹500
    const total = subtotal + tax + deliveryFee;

    // Create order in customer DB
    const order = await Order.create({
      customerId: req.user!._id,
      items: orderItems,
      subtotal,
      tax,
      deliveryFee,
      total,
      address: addressId,
      paymentMethod,
      paymentStatus: paymentMethod === "cod" ? "pending" : "paid", // Razorpay orders are paid
      orderStatus: "placed",
      razorpayOrderId: razorpayOrderId || undefined,
      razorpayPaymentId: razorpayPaymentId || undefined,
    });

    // Clear cart
    cart.items = [];
    await cart.save();

    // Populate address before returning
    await order.populate<{ address: IAddress }>('address');

    res.status(201).json({ success: true, order });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getOrders = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    // Customer can only read their own orders
    // Populate address since it's in the same database (customer DB)
    const orders = await Order.find({ customerId: req.user?._id })
      .populate<{ address: IAddress }>('address')
      .sort({ createdAt: -1 });

    res.json({ success: true, orders });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getOrder = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { orderId } = req.params;

    // Customer can only read their own orders
    // Populate address since it's in the same database (customer DB)
    const order = await Order.findOne({
      _id: orderId,
      customerId: req.user?._id, // Ensure customer can only access their own orders
    }).populate<{ address: IAddress }>('address');

    if (!order) {
      res.status(404).json({ success: false, error: "Order not found" });
      return;
    }

    res.json({ success: true, order });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const createRazorpayOrder = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { amount } = req.body;

    if (!amount || amount < 1) {
      res.status(400).json({ success: false, error: "Invalid amount" });
      return;
    }

    const options = {
      amount: Math.round(amount * 100), // Convert to paise
      currency: "INR",
      receipt: `receipt_${Date.now()}`,
    };

    const razorpayOrder = await getRazorpay().orders.create(options);

    res.json({
      success: true,
      orderId: razorpayOrder.id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const verifyRazorpayPayment = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;

    const crypto = require("crypto");
    const hmac = crypto.createHmac(
      "sha256",
      process.env.RAZORPAY_KEY_SECRET || ""
    );
    hmac.update(`${razorpayOrderId}|${razorpayPaymentId}`);
    const generatedSignature = hmac.digest("hex");

    if (generatedSignature !== razorpaySignature) {
      res
        .status(400)
        .json({ success: false, error: "Invalid payment signature" });
      return;
    }

    // Payment verified - update order payment status
    // This will be called after order creation, so we need to find the order
    // In a real scenario, you'd store the razorpayOrderId when creating the order

    res.json({ success: true, message: "Payment verified" });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

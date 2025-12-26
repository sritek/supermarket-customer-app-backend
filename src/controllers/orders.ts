import { Response } from "express";
import AdminOrder from "../models/AdminOrder";
import Cart from "../models/Cart";
import Product from "../models/Product";
import Address from "../models/Address";
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
    const orderItems = [];

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

    // Map payment method to admin DB format
    const paymentMethodMap: Record<string, 'CASH' | 'CARD' | 'ONLINE' | 'OTHER'> = {
      cod: 'CASH',
      razorpay: 'ONLINE',
    };

    // Map payment status to admin DB format
    const paymentStatusMap: Record<string, 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED'> = {
      pending: 'PENDING',
      paid: 'PAID',
      failed: 'FAILED',
      refunded: 'REFUNDED',
    };

    // Prepare order items for admin DB (with subtotal)
    const adminOrderItems = orderItems.map((item) => ({
      product: item.product,
      name: item.name,
      quantity: item.quantity,
      price: item.price,
      subtotal: item.price * item.quantity,
    }));

    // Get address details
    const addressObj = address.toObject ? address.toObject() : address;

    // Ensure admin DB connection is ready
    const { adminDbConnection } = await import('../config/database');
    if (!adminDbConnection || adminDbConnection.readyState !== 1) {
      res.status(503).json({ 
        success: false, 
        error: 'Service temporarily unavailable. Please try again.' 
      });
      return;
    }

    // Generate order number
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substr(2, 6).toUpperCase();
    const orderNumber = `ORD-${timestamp}-${randomSuffix}`;

    // Create order directly in admin DB (single source of truth)
    try {
      const order = await AdminOrder.create({
        orderNumber,
        customer: req.user!._id,
        items: adminOrderItems,
        subtotal,
        tax,
        shipping: deliveryFee,
        total,
        status: 'PLACED',
        paymentMethod: paymentMethodMap[paymentMethod] || 'OTHER',
        paymentStatus: paymentStatusMap[paymentMethod === "cod" ? "pending" : "paid"] || 'PENDING',
        shippingAddress: {
          street: addressObj.addressLine1 || '',
          city: addressObj.city || '',
          state: addressObj.state || '',
          zipCode: addressObj.pincode || '',
          country: addressObj.country || 'India',
        },
      });

      // Clear cart
      cart.items = [];
      await cart.save();

      // Transform order to match customer app format for response
      const orderResponse = {
        _id: order._id,
        orderNumber: order.orderNumber,
        customerId: order.customer,
        items: order.items.map((item: any) => ({
          product: item.product,
          name: item.name,
          price: item.price,
          quantity: item.quantity,
          image: orderItems.find((oi: any) => oi.product.toString() === item.product.toString())?.image,
        })),
        subtotal: order.subtotal,
        tax: order.tax,
        deliveryFee: order.shipping,
        total: order.total,
        address: addressObj,
        paymentMethod: paymentMethod,
        paymentStatus: paymentMethod === "cod" ? "pending" : "paid",
        orderStatus: order.status.toLowerCase(),
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
      };

      res.status(201).json({ success: true, order: orderResponse });
    } catch (orderError: any) {
      console.error('Error creating order in admin DB:', orderError);
      // If order creation fails, don't clear the cart
      res.status(500).json({ 
        success: false, 
        error: orderError.message || 'Failed to create order. Please try again.' 
      });
      return;
    }

  } catch (error: any) {
    console.error('Error in createOrder:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to create order. Please try again.' 
    });
  }
};

export const getOrders = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    // Customer can only read their own orders from admin DB
    const adminOrders = await AdminOrder.find({ customer: req.user?._id })
      .populate('items.product', 'name sku images')
      .sort({ createdAt: -1 });

    // Transform orders to match customer app format
    const orders = await Promise.all(
      adminOrders.map(async (order: any) => {
        const orderObj = order.toObject ? order.toObject() : order;
        
        // Map status back to customer app format
        const statusMap: Record<string, string> = {
          PLACED: 'placed',
          PROCESSING: 'processing',
          PACKED: 'processing',
          OUT_FOR_DELIVERY: 'shipped',
          DELIVERED: 'delivered',
          CANCELLED: 'cancelled',
        };

        // Map payment method back to customer app format
        const paymentMethodMap: Record<string, string> = {
          CASH: 'cod',
          CARD: 'card',
          ONLINE: 'razorpay',
          OTHER: 'other',
        };

        // Map payment status back to customer app format
        const paymentStatusMap: Record<string, string> = {
          PENDING: 'pending',
          PAID: 'paid',
          FAILED: 'failed',
          REFUNDED: 'refunded',
        };

        return {
          _id: orderObj._id,
          orderNumber: orderObj.orderNumber,
          customerId: orderObj.customer,
          items: orderObj.items.map((item: any) => ({
            product: item.product,
            name: item.name,
            price: item.price,
            quantity: item.quantity,
            image: item.product?.images?.[0],
          })),
          subtotal: orderObj.subtotal,
          tax: orderObj.tax,
          deliveryFee: orderObj.shipping,
          total: orderObj.total,
          address: orderObj.shippingAddress,
          paymentMethod: paymentMethodMap[orderObj.paymentMethod] || 'other',
          paymentStatus: paymentStatusMap[orderObj.paymentStatus] || 'pending',
          orderStatus: statusMap[orderObj.status] || 'placed',
          createdAt: orderObj.createdAt,
          updatedAt: orderObj.updatedAt,
        };
      })
    );

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

    // Customer can only read their own orders from admin DB
    const adminOrder = await AdminOrder.findOne({
      _id: orderId,
      customer: req.user?._id, // Ensure customer can only access their own orders
    }).populate('items.product', 'name sku images');

    if (!adminOrder) {
      res.status(404).json({ success: false, error: "Order not found" });
      return;
    }

    const orderObj = adminOrder.toObject ? adminOrder.toObject() : adminOrder;

    // Map status back to customer app format
    const statusMap: Record<string, string> = {
      PLACED: 'placed',
      PROCESSING: 'processing',
      PACKED: 'processing',
      OUT_FOR_DELIVERY: 'shipped',
      DELIVERED: 'delivered',
      CANCELLED: 'cancelled',
    };

    // Map payment method back to customer app format
    const paymentMethodMap: Record<string, string> = {
      CASH: 'cod',
      CARD: 'card',
      ONLINE: 'razorpay',
      OTHER: 'other',
    };

    // Map payment status back to customer app format
    const paymentStatusMap: Record<string, string> = {
      PENDING: 'pending',
      PAID: 'paid',
      FAILED: 'failed',
      REFUNDED: 'refunded',
    };

    const order = {
      _id: orderObj._id,
      orderNumber: orderObj.orderNumber,
      customerId: orderObj.customer,
      items: orderObj.items.map((item: any) => ({
        product: item.product,
        name: item.name,
        price: item.price,
        quantity: item.quantity,
        image: item.product?.images?.[0],
      })),
      subtotal: orderObj.subtotal,
      tax: orderObj.tax,
      deliveryFee: orderObj.shipping,
      total: orderObj.total,
      address: orderObj.shippingAddress,
      paymentMethod: paymentMethodMap[orderObj.paymentMethod] || 'other',
      paymentStatus: paymentStatusMap[orderObj.paymentStatus] || 'pending',
      orderStatus: statusMap[orderObj.status] || 'placed',
      createdAt: orderObj.createdAt,
      updatedAt: orderObj.updatedAt,
    };

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

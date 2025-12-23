import { Response } from "express";
import Cart from "../models/Cart";
import Product from "../models/Product";
import { AuthRequest } from "../middlewares/auth";

// Helper function to manually populate products from admin DB
// Note: Mongoose populate() doesn't work across different database connections
// So we manually fetch products from admin DB and attach them to cart items
const populateCartProducts = async (cart: any) => {
  if (!cart || !cart.items || cart.items.length === 0) {
    return cart;
  }

  // Get all product IDs from cart items
  const productIds = cart.items.map((item: any) => item.product);

  // Fetch products from admin DB
  // Note: Admin DB products use 'sku' not 'slug', but we'll generate slug for compatibility
  const products = await Product.find({
    _id: { $in: productIds },
    status: "ACTIVE",
  }).select("name price images stock sku unit brand");

  // Create a map of productId -> product for quick lookup
  const productMap = new Map();
  products.forEach((product: any) => {
    productMap.set(product._id.toString(), product.toObject());
  });

  // Attach products to cart items
  cart.items = cart.items
    .map((item: any) => {
      const productId = item.product.toString();
      const product = productMap.get(productId);

      if (product) {
        const productObj = product.toObject ? product.toObject() : product;
        // Add stockQuantity virtual for compatibility
        productObj.stockQuantity = productObj.stock || 0;
        // Generate slug from name if not present (admin DB uses sku, not slug)
        if (!productObj.slug && productObj.name) {
          productObj.slug = productObj.name
            .toLowerCase()
            .replace(/\s+/g, "-")
            .replace(/[^a-z0-9-]/g, "");
        }
        // If still no slug, use sku or _id as fallback
        if (!productObj.slug) {
          productObj.slug = productObj.sku || productObj._id.toString();
        }
        return {
          ...(item.toObject ? item.toObject() : item),
          product: productObj,
        };
      }

      // If product not found, return item with null product (will be filtered out)
      return {
        ...(item.toObject ? item.toObject() : item),
        product: null,
      };
    })
    .filter((item: any) => item.product !== null); // Remove items with missing products

  return cart;
};

export const getCart = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    let cart = await Cart.findOne({ user: req.user?._id });

    if (!cart) {
      // Create an empty cart if it doesn't exist
      cart = await Cart.create({
        user: req.user!._id,
        items: [],
      });
    }

    // Manually populate products from admin DB (populate doesn't work across DBs)
    cart = await populateCartProducts(cart);

    res.json({ success: true, cart });
  } catch (error: any) {
    console.error("Error getting cart:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const addToCart = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { productId, quantity = 1 } = req.body;

    const product = await Product.findById(productId);
    if (!product) {
      res.status(404).json({ success: false, error: "Product not found" });
      return;
    }

    // Admin DB uses 'stock' field, but virtual provides 'stockQuantity' for compatibility
    const availableStock =
      (product as any).stock || (product as any).stockQuantity || 0;
    if (availableStock < quantity) {
      res.status(400).json({ success: false, error: "Insufficient stock" });
      return;
    }

    let cart = await Cart.findOne({ user: req.user?._id });

    if (!cart) {
      cart = await Cart.create({
        user: req.user!._id,
        items: [{ product: productId, quantity }],
      });
    } else {
      const existingItemIndex = cart.items.findIndex(
        (item) => item.product.toString() === productId
      );

      if (existingItemIndex > -1) {
        const newQuantity = cart.items[existingItemIndex].quantity + quantity;
        const availableStock =
          (product as any).stock || (product as any).stockQuantity || 0;
        if (newQuantity > availableStock) {
          res.status(400).json({ success: false, error: "Insufficient stock" });
          return;
        }
        cart.items[existingItemIndex].quantity = newQuantity;
      } else {
        cart.items.push({ product: productId, quantity });
      }

      await cart.save();
    }

    // Manually populate products from admin DB (populate doesn't work across DBs)
    cart = await populateCartProducts(cart);

    res.json({ success: true, cart });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const updateCartItem = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { productId } = req.params;
    const { quantity } = req.body;

    if (quantity < 1) {
      res
        .status(400)
        .json({ success: false, error: "Quantity must be at least 1" });
      return;
    }

    const product = await Product.findById(productId);
    if (!product) {
      res.status(404).json({ success: false, error: "Product not found" });
      return;
    }

    // Admin DB uses 'stock' field, but virtual provides 'stockQuantity' for compatibility
    const availableStock =
      (product as any).stock || (product as any).stockQuantity || 0;
    if (availableStock < quantity) {
      res.status(400).json({ success: false, error: "Insufficient stock" });
      return;
    }

    let cart = await Cart.findOne({ user: req.user?._id });
    if (!cart) {
      res.status(404).json({ success: false, error: "Cart not found" });
      return;
    }

    const itemIndex = cart.items.findIndex(
      (item) => item.product.toString() === productId
    );

    if (itemIndex === -1) {
      res.status(404).json({ success: false, error: "Item not found in cart" });
      return;
    }

    cart.items[itemIndex].quantity = quantity;
    await cart.save();

    // Manually populate products from admin DB (populate doesn't work across DBs)
    cart = await populateCartProducts(cart);

    res.json({ success: true, cart });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const removeFromCart = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { productId } = req.params;

    let cart = await Cart.findOne({ user: req.user?._id });
    if (!cart) {
      res.status(404).json({ success: false, error: "Cart not found" });
      return;
    }

    cart.items = cart.items.filter(
      (item) => item.product.toString() !== productId
    );

    await cart.save();

    // Manually populate products from admin DB (populate doesn't work across DBs)
    cart = await populateCartProducts(cart);

    res.json({ success: true, cart });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const clearCart = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const cart = await Cart.findOne({ user: req.user?._id });
    if (!cart) {
      res.json({ success: true, message: "Cart already empty" });
      return;
    }

    cart.items = [];
    await cart.save();

    res.json({ success: true, message: "Cart cleared" });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const syncGuestCart = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { items } = req.body; // Array of { productId, quantity }

    if (!Array.isArray(items)) {
      res.status(400).json({ success: false, error: "Invalid items format" });
      return;
    }

    let cart = await Cart.findOne({ user: req.user?._id });

    if (!cart) {
      cart = await Cart.create({
        user: req.user!._id,
        items: [],
      });
    }

    // Merge guest cart items
    for (const item of items) {
      const product = await Product.findById(item.productId);
      if (!product) {
        continue; // Skip invalid items
      }

      // Admin DB uses 'stock' field, but virtual provides 'stockQuantity' for compatibility
      const availableStock =
        (product as any).stock || (product as any).stockQuantity || 0;
      if (availableStock < item.quantity) {
        continue; // Skip invalid items
      }

      const existingItemIndex = cart.items.findIndex(
        (cartItem) => cartItem.product.toString() === item.productId
      );

      if (existingItemIndex > -1) {
        // Update quantity if item exists
        const newQuantity = Math.min(
          cart.items[existingItemIndex].quantity + item.quantity,
          availableStock
        );
        cart.items[existingItemIndex].quantity = newQuantity;
      } else {
        // Add new item
        cart.items.push({
          product: item.productId,
          quantity: item.quantity,
        });
      }
    }

    await cart.save();

    // Manually populate products from admin DB (populate doesn't work across DBs)
    cart = await populateCartProducts(cart);

    res.json({ success: true, cart });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

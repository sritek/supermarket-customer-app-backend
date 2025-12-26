import { Request, Response } from "express";
import Product from "../models/Product";
import Category from "../models/Category";

export const getProducts = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const {
      page = "1",
      limit = "20",
      category,
      minPrice,
      maxPrice,
      inStock,
      sort = "newest",
    } = req.query;

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    // Build query - Include ACTIVE and UNAVAILABLE products (UNAVAILABLE shows as out of stock)
    const query: any = { status: { $in: ["ACTIVE", "UNAVAILABLE"] } };

    console.log("🔍 Products query:", JSON.stringify(query, null, 2));

    if (category) {
      const categoryDoc = await Category.findOne({ slug: category });
      if (categoryDoc) {
        query.category = categoryDoc._id;
      }
    }

    if (minPrice || maxPrice) {
      query.price = {};
      if (minPrice) query.price.$gte = parseFloat(minPrice as string);
      if (maxPrice) query.price.$lte = parseFloat(maxPrice as string);
    }

    // Admin DB uses 'stock' field, not 'stockQuantity'
    if (inStock === "true") {
      query.stock = { $gt: 0 };
    } else if (inStock === "false") {
      query.stock = { $lte: 0 };
    }

    // Build sort
    let sortOption: any = {};
    switch (sort) {
      case "price-low":
        sortOption = { price: 1 };
        break;
      case "price-high":
        sortOption = { price: -1 };
        break;
      case "newest":
        sortOption = { createdAt: -1 };
        break;
      case "popular":
        // For now, sort by createdAt. Can be enhanced with order count later
        sortOption = { createdAt: -1 };
        break;
      default:
        sortOption = { createdAt: -1 };
    }

    const products = await Product.find(query)
      .populate("category", "name slug")
      .sort(sortOption)
      .skip(skip)
      .limit(limitNum);

    const total = await Product.countDocuments(query);

    console.log(`✅ Found ${products.length} products (total: ${total})`);

    // Generate slugs for products that don't have them (admin DB uses sku, not slug)
    const productsWithSlugs = products.map((product: any) => {
      const productObj = product.toObject ? product.toObject() : product;
      if (!productObj.slug && productObj.name) {
        // Generate slug from name
        productObj.slug = productObj.name
          .toLowerCase()
          .replace(/\s+/g, "-")
          .replace(/[^a-z0-9-]/g, "");
        // If still no slug, use _id as fallback
        if (!productObj.slug) {
          productObj.slug = productObj._id.toString();
        }
      }
      // Ensure stockQuantity virtual is available
      if (!productObj.stockQuantity && productObj.stock !== undefined) {
        productObj.stockQuantity = productObj.stock;
      }
      return productObj;
    });

    res.json({
      success: true,
      products: productsWithSlugs,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getProduct = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { slug } = req.params;

    if (!slug || slug.trim().length === 0) {
      res
        .status(400)
        .json({ success: false, error: "Product identifier is required" });
      return;
    }

    // Admin DB uses "ACTIVE" (uppercase) and may not have slug field
    // Try multiple lookup strategies:
    // 1. By slug (if exists)
    // 2. By _id (if slug is a valid ObjectId)
    // 3. By name (exact match)
    // 4. By sku (exact match)

    let product = null;
    const mongoose = require("mongoose");

    // Check if slug is a valid ObjectId
    const isValidObjectId = mongoose.Types.ObjectId.isValid(slug);

    if (isValidObjectId) {
      // Try by _id first if it's a valid ObjectId
      product = await Product.findOne({
        _id: slug,
        status: { $in: ["ACTIVE", "UNAVAILABLE"] },
      }).populate("category", "name slug");
    }

    // If not found by _id, try by slug
    if (!product) {
      product = await Product.findOne({
        slug: slug,
        status: { $in: ["ACTIVE", "UNAVAILABLE"] },
      }).populate("category", "name slug");
    }

    // If still not found, try by name (case-insensitive)
    // Handle both spaces and hyphens in product names (e.g., "Nuts Mix" matches "nuts-mix")
    if (!product) {
      // Convert slug to regex pattern that matches both spaces and hyphens
      // Escape special regex characters in slug, then replace hyphens with [\s-]+ to match both
      const escapedSlug = slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const normalizedPattern = escapedSlug.replace(/-/g, "[\\s-]+");

      product = await Product.findOne({
        name: { $regex: new RegExp(`^${normalizedPattern}$`, "i") },
        status: { $in: ["ACTIVE", "UNAVAILABLE"] },
      }).populate("category", "name slug");
    }

    // If still not found, try by sku (case-insensitive)
    if (!product) {
      product = await Product.findOne({
        sku: { $regex: new RegExp(`^${slug}$`, "i") },
        status: { $in: ["ACTIVE", "UNAVAILABLE"] },
      }).populate("category", "name slug");
    }

    if (!product) {
      res.status(404).json({ success: false, error: "Product not found" });
      return;
    }

    // Generate slug if missing (admin DB uses sku, not slug)
    const productObj = product.toObject ? product.toObject() : product;
    if (!productObj.slug && productObj.name) {
      productObj.slug = productObj.name
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-]/g, "");
      if (!productObj.slug) {
        productObj.slug = productObj._id.toString();
      }
    }
    // Ensure stockQuantity virtual is available
    if (!productObj.stockQuantity && productObj.stock !== undefined) {
      productObj.stockQuantity = productObj.stock;
    }

    res.json({ success: true, product: productObj });
  } catch (error: any) {
    console.error("Error in getProduct:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const searchProducts = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { q, limit = "20" } = req.query;

    if (!q || (q as string).trim().length === 0) {
      res.json({ success: true, products: [], query: q });
      return;
    }

    const limitNum = parseInt(limit as string);
    const searchQuery = (q as string).trim();

    // Use regex search instead of $text to avoid requiring text index
    // Search in name and description fields
    const products = await Product.find({
      $or: [
        { name: { $regex: searchQuery, $options: "i" } },
        { description: { $regex: searchQuery, $options: "i" } },
        { sku: { $regex: searchQuery, $options: "i" } },
      ],
      status: { $in: ["ACTIVE", "UNAVAILABLE"] }, // Include UNAVAILABLE products
    })
      .populate("category", "name slug")
      .limit(limitNum);

    // Generate slugs for products that don't have them
    const productsWithSlugs = products.map((product: any) => {
      const productObj = product.toObject ? product.toObject() : product;
      if (!productObj.slug && productObj.name) {
        productObj.slug = productObj.name
          .toLowerCase()
          .replace(/\s+/g, "-")
          .replace(/[^a-z0-9-]/g, "");
        if (!productObj.slug) {
          productObj.slug = productObj._id.toString();
        }
      }
      if (!productObj.stockQuantity && productObj.stock !== undefined) {
        productObj.stockQuantity = productObj.stock;
      }
      return productObj;
    });

    res.json({ success: true, products: productsWithSlugs, query: q });
  } catch (error: any) {
    console.error("Search error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getProductsByCategory = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { categorySlug } = req.params;
    const {
      page = "1",
      limit = "20",
      minPrice,
      maxPrice,
      inStock,
      sort = "newest",
    } = req.query;

    const category = await Category.findOne({ slug: categorySlug });
    if (!category) {
      res.status(404).json({ success: false, error: "Category not found" });
      return;
    }

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    const query: any = {
      category: category._id,
      status: { $in: ["ACTIVE", "UNAVAILABLE"] }, // Include UNAVAILABLE products
    };

    if (minPrice || maxPrice) {
      query.price = {};
      if (minPrice) query.price.$gte = parseFloat(minPrice as string);
      if (maxPrice) query.price.$lte = parseFloat(maxPrice as string);
    }

    // Handle inStock parameter - Admin DB uses 'stock' field
    if (inStock !== undefined && inStock !== null && inStock !== "") {
      const inStockValue = String(inStock).toLowerCase();
      if (inStockValue === "true" || inStockValue === "1") {
        query.stock = { $gt: 0 };
      } else if (inStockValue === "false" || inStockValue === "0") {
        query.stock = { $lte: 0 };
      }
    }

    let sortOption: any = {};
    switch (sort) {
      case "price-low":
        sortOption = { price: 1 };
        break;
      case "price-high":
        sortOption = { price: -1 };
        break;
      case "newest":
        sortOption = { createdAt: -1 };
        break;
      case "popular":
        sortOption = { createdAt: -1 };
        break;
      default:
        sortOption = { createdAt: -1 };
    }

    const products = await Product.find(query)
      .populate("category", "name slug")
      .sort(sortOption)
      .skip(skip)
      .limit(limitNum);

    const total = await Product.countDocuments(query);

    console.log(`Found ${products.length} products, total: ${total}`);

    // Generate slugs for products that don't have them
    const productsWithSlugs = products.map((product: any) => {
      const productObj = product.toObject ? product.toObject() : product;
      if (!productObj.slug && productObj.name) {
        productObj.slug = productObj.name
          .toLowerCase()
          .replace(/\s+/g, "-")
          .replace(/[^a-z0-9-]/g, "");
        if (!productObj.slug) {
          productObj.slug = productObj._id.toString();
        }
      }
      if (!productObj.stockQuantity && productObj.stock !== undefined) {
        productObj.stockQuantity = productObj.stock;
      }
      return productObj;
    });

    res.json({
      success: true,
      category,
      products: productsWithSlugs,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

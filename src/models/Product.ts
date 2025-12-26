import mongoose, { Document, Schema } from "mongoose";
import { connectAdminDB, adminDbConnection } from "../config/database";

// READ-ONLY: Product model reads from admin DB (supermarket_admin)
// Customer app must NEVER write to products - products are managed in admin DB only
// This model uses admin DB connection for read-only access

export interface IProduct extends Document {
  name: string;
  sku?: string;
  slug?: string;
  description?: string;
  category: mongoose.Types.ObjectId;
  price: number;
  stock: number; // Admin DB uses 'stock', not 'stockQuantity'
  stockQuantity?: number; // Alias for compatibility
  images: string[];
  status: "ACTIVE" | "INACTIVE" | "UNAVAILABLE"; // Admin DB uses uppercase
  unit?: string;
  brand?: string;
  lowStockThreshold?: number;
  createdAt: Date;
  updatedAt: Date;
}

const ProductSchema = new Schema<IProduct>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    sku: {
      type: String,
      trim: true,
      uppercase: true,
    },
    slug: {
      type: String,
      lowercase: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    category: {
      type: Schema.Types.ObjectId,
      ref: "Category",
      required: true,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    stock: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    images: [
      {
        type: String,
      },
    ],
    status: {
      type: String,
      enum: ["ACTIVE", "INACTIVE", "UNAVAILABLE"], // Match admin DB enum
      default: "ACTIVE",
    },
    unit: {
      type: String,
      default: "piece",
      trim: true,
    },
    brand: {
      type: String,
      trim: true,
    },
    lowStockThreshold: {
      type: Number,
      default: 10,
      min: 0,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Index for search - match admin DB indexes
ProductSchema.index({ name: "text", description: "text", sku: "text" });
ProductSchema.index({ category: 1, status: 1, price: 1 });

// Virtual for stockQuantity (backward compatibility)
ProductSchema.virtual("stockQuantity").get(function () {
  return this.stock;
});

// Use admin DB connection for read-only access
// Model is created lazily when first accessed (after admin connection is established)

let ProductModel: mongoose.Model<IProduct> | null = null;

const getProductModel = (): mongoose.Model<IProduct> => {
  // If model already created, return it
  if (ProductModel) {
    return ProductModel;
  }

  // Check if admin connection is ready
  if (adminDbConnection && adminDbConnection.readyState === 1) {
    // Check if model already exists on this connection
    if (adminDbConnection.models.Product) {
      ProductModel = adminDbConnection.models
        .Product as mongoose.Model<IProduct>;
    } else {
      ProductModel = adminDbConnection.model<IProduct>(
        "Product",
        ProductSchema
      );
    }
    return ProductModel;
  }

  // Admin connection not ready yet - this should not happen in normal flow
  // but we'll throw an error to make it clear
  throw new Error(
    "Product model: Admin database connection not established. Ensure connectAdminDB() is called in server.ts before using Product model."
  );
};

// Export a proxy that lazily initializes the model on first access
export default new Proxy({} as mongoose.Model<IProduct>, {
  get(target, prop) {
    const model = getProductModel();
    const value = (model as any)[prop];
    // If it's a function, bind it to the model
    if (typeof value === "function") {
      return value.bind(model);
    }
    return value;
  },
}) as mongoose.Model<IProduct>;

import mongoose, { Document, Schema } from 'mongoose';
import { connectAdminDB, adminDbConnection } from '../config/database';

// READ-ONLY: Category model reads from admin DB (supermarket_admin)
// Customer app must NEVER write to categories - categories are managed in admin DB only
// This model uses admin DB connection for read-only access

export interface ICategory extends Document {
  name: string;
  slug: string;
  description?: string;
  image?: string;
  createdAt: Date;
  updatedAt: Date;
}

const CategorySchema = new Schema<ICategory>(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },
    description: {
      type: String,
      trim: true
    },
    image: {
      type: String
    }
  },
  {
    timestamps: true
  }
);

// Use admin DB connection for read-only access
// Model is created lazily when first accessed (after admin connection is established)

let CategoryModel: mongoose.Model<ICategory> | null = null;

const getCategoryModel = (): mongoose.Model<ICategory> => {
  // If model already created, return it
  if (CategoryModel) {
    return CategoryModel;
  }
  
  // Check if admin connection is ready
  if (adminDbConnection && adminDbConnection.readyState === 1) {
    // Check if model already exists on this connection
    if (adminDbConnection.models.Category) {
      CategoryModel = adminDbConnection.models.Category as mongoose.Model<ICategory>;
    } else {
      CategoryModel = adminDbConnection.model<ICategory>('Category', CategorySchema);
    }
    return CategoryModel;
  }
  
  // Admin connection not ready yet - this should not happen in normal flow
  // but we'll throw an error to make it clear
  throw new Error('Category model: Admin database connection not established. Ensure connectAdminDB() is called in server.ts before using Category model.');
};

// Export a proxy that lazily initializes the model on first access
export default new Proxy({} as mongoose.Model<ICategory>, {
  get(target, prop) {
    const model = getCategoryModel();
    const value = (model as any)[prop];
    // If it's a function, bind it to the model
    if (typeof value === 'function') {
      return value.bind(model);
    }
    return value;
  }
}) as mongoose.Model<ICategory>;


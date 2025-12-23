import mongoose, { Document, Schema } from 'mongoose';

// CUSTOMER DATABASE OWNERSHIP
// Cart model belongs to supermarket_customer database
// Cart items reference products by ID (products stored in admin DB)
// Customer-specific data only

export interface ICartItem {
  product: mongoose.Types.ObjectId; // References product ID from admin DB
  quantity: number;
}

export interface ICart extends Document {
  user: mongoose.Types.ObjectId;
  items: ICartItem[];
  updatedAt: Date;
}

const CartItemSchema = new Schema<ICartItem>({
  product: {
    type: Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  quantity: {
    type: Number,
    required: true,
    min: 1,
    default: 1
  }
}, { _id: false });

const CartSchema = new Schema<ICart>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true
    },
    items: [CartItemSchema]
  },
  {
    timestamps: { createdAt: false, updatedAt: true }
  }
);

export default mongoose.model<ICart>('Cart', CartSchema);


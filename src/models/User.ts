import mongoose, { Document, Schema } from 'mongoose';

// CUSTOMER DATABASE OWNERSHIP
// User model belongs to supermarket_customer database
// This is the customer-facing user model (not admin users)

export interface IUser extends Document {
  email: string;
  password: string;
  name?: string;
  phone?: string;
  role: 'customer' | 'admin' | 'employee' | 'stock_manager';
  verified: boolean;
  otp?: string;
  otpExpiry?: Date;
  addresses: mongoose.Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },
    password: {
      type: String,
      required: true,
      minlength: 6
    },
    name: {
      type: String,
      trim: true
    },
    phone: {
      type: String,
      trim: true
    },
    role: {
      type: String,
      enum: ['customer', 'admin', 'employee', 'stock_manager'],
      default: 'customer'
    },
    verified: {
      type: Boolean,
      default: false
    },
    otp: {
      type: String
    },
    otpExpiry: {
      type: Date
    },
    addresses: [{
      type: Schema.Types.ObjectId,
      ref: 'Address'
    }]
  },
  {
    timestamps: true
  }
);

export default mongoose.model<IUser>('User', UserSchema);


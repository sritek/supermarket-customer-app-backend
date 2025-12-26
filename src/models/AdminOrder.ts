import mongoose, { Document, Schema, Connection } from 'mongoose';
import { adminDbConnection } from '../config/database';

// Order model for Admin DB (single source of truth)
// Orders are created and stored in admin DB, customer app reads from here

export interface IAdminOrderItem {
  product: mongoose.Types.ObjectId;
  name: string;
  quantity: number;
  price: number;
  subtotal: number;
}

export interface IAdminOrder extends Document {
  orderNumber: string;
  customer: mongoose.Types.ObjectId; // References User._id from customer DB
  items: IAdminOrderItem[];
  subtotal: number;
  tax: number;
  shipping: number;
  total: number;
  status: 'PLACED' | 'PROCESSING' | 'PACKED' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'CANCELLED';
  paymentMethod: 'CASH' | 'CARD' | 'ONLINE' | 'OTHER';
  paymentStatus: 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED';
  shippingAddress: {
    street?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    country?: string;
  };
  assignedTo?: mongoose.Types.ObjectId;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const orderItemSchema = new Schema<IAdminOrderItem>({
  product: {
    type: Schema.Types.ObjectId,
    ref: 'Product',
    required: true,
  },
  name: {
    type: String,
    required: true,
  },
  quantity: {
    type: Number,
    required: true,
    min: 1,
  },
  price: {
    type: Number,
    required: true,
    min: 0,
  },
  subtotal: {
    type: Number,
    required: true,
    min: 0,
  },
}, { _id: false });

const orderSchema = new Schema<IAdminOrder>(
  {
    orderNumber: {
      type: String,
      required: true,
      unique: true,
    },
    customer: {
      type: Schema.Types.ObjectId,
      required: true,
      // Note: References User._id from customer DB (cross-DB reference)
    },
    items: [orderItemSchema],
    subtotal: {
      type: Number,
      required: true,
      min: 0,
    },
    tax: {
      type: Number,
      default: 0,
      min: 0,
    },
    shipping: {
      type: Number,
      default: 0,
      min: 0,
    },
    total: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      enum: ['PLACED', 'PROCESSING', 'PACKED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED'],
      default: 'PLACED',
    },
    paymentMethod: {
      type: String,
      enum: ['CASH', 'CARD', 'ONLINE', 'OTHER'],
      required: true,
    },
    paymentStatus: {
      type: String,
      enum: ['PENDING', 'PAID', 'FAILED', 'REFUNDED'],
      default: 'PENDING',
    },
    shippingAddress: {
      street: String,
      city: String,
      state: String,
      zipCode: String,
      country: String,
    },
    assignedTo: {
      type: Schema.Types.ObjectId,
      ref: 'Employee',
    },
    notes: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

// Note: Order number is generated in the controller before creating the order
// Pre-save hooks don't work reliably with the proxy pattern used for cross-DB models

// Indexes
orderSchema.index({ customer: 1, createdAt: -1 });
orderSchema.index({ status: 1 });
orderSchema.index({ paymentStatus: 1 });

// Get Order model from admin DB connection
const getAdminOrderModel = () => {
  if (!adminDbConnection || adminDbConnection.readyState !== 1) {
    throw new Error('Admin DB connection not established');
  }

  if (adminDbConnection.models.Order) {
    return adminDbConnection.models.Order as mongoose.Model<IAdminOrder>;
  }

  return adminDbConnection.model<IAdminOrder>('Order', orderSchema);
};

// Export a proxy that lazily initializes the model
export default new Proxy({} as mongoose.Model<IAdminOrder>, {
  get(target, prop) {
    const model = getAdminOrderModel();
    const value = (model as any)[prop];
    if (typeof value === 'function') {
      return value.bind(model);
    }
    return value;
  },
});


import mongoose, { Document, Schema } from 'mongoose';
import { adminDbConnection } from '../config/database';

// SOURCE OF TRUTH: Admin DB
// Orders are created ONLY in supermarket_admin database
// References customer via customerId (ObjectId from customer DB - User._id)
// Customer APIs can read only their own orders, cannot update order status
// This model uses admin DB connection

export interface IOrderItem {
  product: mongoose.Types.ObjectId; // References product ID from admin DB
  name: string;
  price: number;
  quantity: number;
  image?: string;
}

export interface IOrder extends Document {
  customerId: mongoose.Types.ObjectId; // References User._id from customer DB
  items: IOrderItem[];
  subtotal: number;
  tax: number;
  deliveryFee: number;
  total: number;
  address: mongoose.Types.ObjectId; // References Address._id from customer DB
  paymentMethod: 'cod' | 'razorpay';
  paymentStatus: 'pending' | 'paid' | 'failed' | 'refunded';
  orderStatus: 'placed' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  assignedEmployee?: mongoose.Types.ObjectId; // References Employee from admin DB
  createdAt: Date;
  updatedAt: Date;
}

const OrderItemSchema = new Schema<IOrderItem>({
  product: {
    type: Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  name: {
    type: String,
    required: true
  },
  price: {
    type: Number,
    required: true
  },
  quantity: {
    type: Number,
    required: true,
    min: 1
  },
  image: {
    type: String
  }
}, { _id: false });

const OrderSchema = new Schema<IOrder>(
  {
    customerId: {
      type: Schema.Types.ObjectId,
      required: true,
      // Note: References User._id from customer DB (cross-DB reference)
      // Cannot use ref: 'User' as User is in different database
    },
    items: [OrderItemSchema],
    subtotal: {
      type: Number,
      required: true,
      min: 0
    },
    tax: {
      type: Number,
      required: true,
      default: 0,
      min: 0
    },
    deliveryFee: {
      type: Number,
      required: true,
      default: 0,
      min: 0
    },
    total: {
      type: Number,
      required: true,
      min: 0
    },
    address: {
      type: Schema.Types.ObjectId,
      required: true,
      // Note: References Address._id from customer DB (cross-DB reference)
      // Cannot use ref: 'Address' as Address is in different database
    },
    paymentMethod: {
      type: String,
      enum: ['cod', 'razorpay'],
      required: true
    },
    paymentStatus: {
      type: String,
      enum: ['pending', 'paid', 'failed', 'refunded'],
      default: 'pending'
    },
    orderStatus: {
      type: String,
      enum: ['placed', 'processing', 'shipped', 'delivered', 'cancelled'],
      default: 'placed'
    },
    razorpayOrderId: {
      type: String
    },
    razorpayPaymentId: {
      type: String
    },
    assignedEmployee: {
      type: Schema.Types.ObjectId,
      // Note: References Employee from admin DB (if needed)
    }
  },
  {
    timestamps: true
  }
);

// Indexes
OrderSchema.index({ customerId: 1, createdAt: -1 });
OrderSchema.index({ orderStatus: 1 });
OrderSchema.index({ paymentStatus: 1 });

// Use admin DB connection for orders
// Model is created lazily when first accessed (after admin connection is established)

let OrderModel: mongoose.Model<IOrder> | null = null;

const getOrderModel = (): mongoose.Model<IOrder> => {
  // If model already created, return it
  if (OrderModel) {
    return OrderModel;
  }
  
  // Check if admin connection is ready
  if (adminDbConnection && adminDbConnection.readyState === 1) {
    // Check if model already exists on this connection
    if (adminDbConnection.models.Order) {
      OrderModel = adminDbConnection.models.Order as mongoose.Model<IOrder>;
    } else {
      OrderModel = adminDbConnection.model<IOrder>('Order', OrderSchema);
    }
    return OrderModel;
  }
  
  // Admin connection not ready yet - this should not happen in normal flow
  // but we'll throw an error to make it clear
  throw new Error('Order model: Admin database connection not established. Ensure connectAdminDB() is called in server.ts before using Order model.');
};

// Export a proxy that lazily initializes the model on first access
export default new Proxy({} as mongoose.Model<IOrder>, {
  get(target, prop) {
    const model = getOrderModel();
    const value = (model as any)[prop];
    // If it's a function, bind it to the model
    if (typeof value === 'function') {
      return value.bind(model);
    }
    return value;
  }
}) as mongoose.Model<IOrder>;


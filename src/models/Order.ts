import mongoose, { Document, Schema } from 'mongoose';

// Orders are stored in the CUSTOMER database (supermarket_customer)
// This allows the customer app to create orders after payment
// Admin panel can access orders via API if needed
// References products via product ObjectId (from admin DB - stored as reference)

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
    // Note: No ref - Product is in admin DB, order is in customer DB (cross-DB reference)
    // Product data is stored directly in order items (name, price, image)
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
      ref: 'User',
      required: true,
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
      ref: 'Address',
      required: true,
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

// Use default mongoose connection (customer DB) for orders
// This allows the customer app to create orders after payment
export default mongoose.model<IOrder>('Order', OrderSchema);


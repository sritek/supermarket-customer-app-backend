import express from 'express';
import {
  createOrder,
  getOrders,
  getOrder,
  createRazorpayOrder,
  verifyRazorpayPayment
} from '../controllers/orders';
import { authenticate } from '../middlewares/auth';

const router = express.Router();

router.use(authenticate);
router.post('/', createOrder);
router.get('/', getOrders);
router.get('/:orderId', getOrder);
router.post('/razorpay/create', createRazorpayOrder);
router.post('/razorpay/verify', verifyRazorpayPayment);

export default router;


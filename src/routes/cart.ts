import express from 'express';
import {
  getCart,
  addToCart,
  updateCartItem,
  removeFromCart,
  clearCart,
  syncGuestCart
} from '../controllers/cart';
import { authenticate } from '../middlewares/auth';

const router = express.Router();

router.use(authenticate);
router.get('/', getCart);
router.post('/', addToCart);
router.put('/:productId', updateCartItem);
router.delete('/:productId', removeFromCart);
router.delete('/', clearCart);
router.post('/sync', syncGuestCart);

export default router;


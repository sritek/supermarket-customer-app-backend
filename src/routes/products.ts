import express from 'express';
import {
  getProducts,
  getProduct,
  searchProducts,
  getProductsByCategory
} from '../controllers/products';

const router = express.Router();

router.get('/', getProducts);
router.get('/search', searchProducts);
router.get('/category/:categorySlug', getProductsByCategory);
router.get('/:slug', getProduct);

export default router;


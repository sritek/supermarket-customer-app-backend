import express from 'express';
import { getCategories, getCategory } from '../controllers/categories';

const router = express.Router();

router.get('/', getCategories);
router.get('/:slug', getCategory);

export default router;


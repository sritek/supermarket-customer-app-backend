import { Request, Response } from 'express';
import Category from '../models/Category';

export const getCategories = async (req: Request, res: Response): Promise<void> => {
  try {
    const categories = await Category.find().sort({ name: 1 });
    res.json({ success: true, categories });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getCategory = async (req: Request, res: Response): Promise<void> => {
  try {
    const { slug } = req.params;
    const category = await Category.findOne({ slug });

    if (!category) {
      res.status(404).json({ success: false, error: 'Category not found' });
      return;
    }

    res.json({ success: true, category });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};


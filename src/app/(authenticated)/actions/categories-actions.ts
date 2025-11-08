"use server";

import { createCategoriesActions } from "@/server/categories/categories-service";

const actions = createCategoriesActions();

export const getCategories = actions.getCategories;
export const saveCategories = actions.saveCategories;

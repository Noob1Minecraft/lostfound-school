import { Backpack, BookOpen, Headphones, Package, Shirt, type LucideIcon } from 'lucide-react'
import type { Category } from '../shared/domain'

const categoryIcons: Record<Category, LucideIcon> = {
  'Электроника': Headphones,
  'Одежда': Shirt,
  'Школьные принадлежности': BookOpen,
  'Аксессуары': Backpack,
  'Другое': Package,
}

export function CategoryIcon({ category, size = 48 }: { category: Category; size?: number }) {
  const Icon = categoryIcons[category] ?? Package
  return <Icon size={size} strokeWidth={1.5} aria-hidden="true" />
}

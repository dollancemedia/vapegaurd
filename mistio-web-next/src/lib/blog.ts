import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';

const BLOG_DIR = path.join(process.cwd(), 'content', 'blog');

export type BlogPost = {
  slug: string;
  title: string;
  description: string;
  date: string;
  image?: string;
  keywords: string[];
  content: string;
};

export function getAllPosts(): BlogPost[] {
  if (!fs.existsSync(BLOG_DIR)) return [];

  const files = fs.readdirSync(BLOG_DIR).filter((f) => f.endsWith('.mdx'));

  const posts = files.map((file) => {
    const source = fs.readFileSync(path.join(BLOG_DIR, file), 'utf-8');
    const { data, content } = matter(source);
    return {
      slug: file.replace('.mdx', ''),
      title: data.title || '',
      description: data.description || '',
      date: data.date || '',
      image: data.image || undefined,
      keywords: data.keywords || [],
      content,
    };
  });

  return posts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export function getPostBySlug(slug: string): BlogPost | null {
  const filePath = path.join(BLOG_DIR, `${slug}.mdx`);
  if (!fs.existsSync(filePath)) return null;

  const source = fs.readFileSync(filePath, 'utf-8');
  const { data, content } = matter(source);

  return {
    slug,
    title: data.title || '',
    description: data.description || '',
    date: data.date || '',
    image: data.image || undefined,
    keywords: data.keywords || [],
    content,
  };
}

export function getAllSlugs(): string[] {
  if (!fs.existsSync(BLOG_DIR)) return [];
  return fs
    .readdirSync(BLOG_DIR)
    .filter((f) => f.endsWith('.mdx'))
    .map((f) => f.replace('.mdx', ''));
}

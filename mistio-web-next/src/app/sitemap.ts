import { MetadataRoute } from 'next';
import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = 'https://www.mistio.app';

  const staticPages: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${baseUrl}/schools`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/blog`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/privacy-policy`,
      lastModified: new Date(),
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: `${baseUrl}/terms-of-service`,
      lastModified: new Date(),
      changeFrequency: 'yearly',
      priority: 0.3,
    },
  ];

  const blogDir = path.join(process.cwd(), 'content', 'blog');
  let blogPages: MetadataRoute.Sitemap = [];

  if (fs.existsSync(blogDir)) {
    const files = fs.readdirSync(blogDir).filter((f) => f.endsWith('.mdx'));
    blogPages = files.map((file) => {
      const source = fs.readFileSync(path.join(blogDir, file), 'utf-8');
      const { data } = matter(source);
      const slug = file.replace('.mdx', '');
      return {
        url: `${baseUrl}/blog/${slug}`,
        lastModified: data.date ? new Date(data.date) : new Date(),
        changeFrequency: 'monthly' as const,
        priority: 0.7,
      };
    });
  }

  return [...staticPages, ...blogPages];
}

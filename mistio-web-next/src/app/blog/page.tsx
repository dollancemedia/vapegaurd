import { getAllPosts } from '@/lib/blog';
import { Navbar } from '@/components/Navbar';
import { StackedCircularFooter } from '@/components/ui/stacked-circular-footer';
import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Blog',
  description:
    'Guides, comparisons, and insights on vape detection for K-12 schools. Learn how Mistio compares to HALO, Verkada, Zeptive, Triton, and more.',
  openGraph: {
    title: 'Mistio Blog - Vape Detection Guides & Comparisons',
    description:
      'Guides, comparisons, and insights on vape detection for K-12 schools.',
  },
};

export default function BlogIndex() {
  const posts = getAllPosts();

  return (
    <>
      <Navbar />
      <main className="pt-28 pb-20 bg-white min-h-screen">
        <div className="max-w-4xl mx-auto px-4">
          <h1 className="text-4xl md:text-5xl font-bold text-mistio-dark mb-4 tracking-tight">
            Blog
          </h1>
          <p className="text-lg text-mistio-gray mb-12 max-w-2xl">
            Honest comparisons, installation guides, and everything schools need
            to know about vape detection.
          </p>

          {posts.length === 0 ? (
            <p className="text-mistio-gray">Posts coming soon.</p>
          ) : (
            <div className="grid gap-8">
              {posts.map((post) => (
                <Link
                  key={post.slug}
                  href={`/blog/${post.slug}`}
                  className="group block border border-slate-200 rounded-2xl p-6 hover:border-mistio-teal/50 hover:shadow-lg transition-all duration-300"
                >
                  <div className="flex items-center gap-3 text-sm text-mistio-gray mb-3">
                    <time dateTime={post.date}>
                      {new Date(post.date).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })}
                    </time>
                  </div>
                  <h2 className="text-2xl font-bold text-mistio-dark group-hover:text-mistio-teal transition-colors mb-2">
                    {post.title}
                  </h2>
                  <p className="text-mistio-gray leading-relaxed">
                    {post.description}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>
      <StackedCircularFooter />
    </>
  );
}

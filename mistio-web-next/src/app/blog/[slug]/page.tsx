import { getAllSlugs, getPostBySlug } from '@/lib/blog';
import { Navbar } from '@/components/Navbar';
import { StackedCircularFooter } from '@/components/ui/stacked-circular-footer';
import { notFound } from 'next/navigation';
import { MDXRemote } from 'next-mdx-remote/rsc';
import remarkGfm from 'remark-gfm';
import Link from 'next/link';
import type { Metadata } from 'next';

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateStaticParams() {
  return getAllSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) return {};

  return {
    title: post.title,
    description: post.description,
    keywords: post.keywords,
    openGraph: {
      title: post.title,
      description: post.description,
      type: 'article',
      publishedTime: post.date,
      url: `https://www.mistio.app/blog/${slug}`,
    },
    twitter: {
      card: 'summary_large_image',
      title: post.title,
      description: post.description,
    },
  };
}

export default async function BlogPost({ params }: Props) {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) notFound();

  const articleImage = post.image
    ? `https://www.mistio.app${post.image}`
    : 'https://www.mistio.app/logo.png';

  const articleSchema = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.description,
    image: [articleImage],
    datePublished: post.date,
    dateModified: post.date,
    author: {
      '@type': 'Organization',
      name: 'Mistio',
      url: 'https://www.mistio.app',
    },
    publisher: {
      '@type': 'Organization',
      name: 'Mistio',
      url: 'https://www.mistio.app',
      logo: {
        '@type': 'ImageObject',
        url: 'https://www.mistio.app/logo.png',
      },
    },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': `https://www.mistio.app/blog/${slug}`,
    },
  };

  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://www.mistio.app' },
      { '@type': 'ListItem', position: 2, name: 'Blog', item: 'https://www.mistio.app/blog' },
      { '@type': 'ListItem', position: 3, name: post.title, item: `https://www.mistio.app/blog/${slug}` },
    ],
  };

  return (
    <>
      <Navbar />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
      />
      <main className="pt-28 pb-20 bg-white min-h-screen">
        <article className="max-w-3xl mx-auto px-4">
          <div className="mb-8">
            <Link
              href="/blog"
              className="text-sm text-mistio-teal hover:underline"
            >
              &larr; Back to Blog
            </Link>
          </div>

          <header className="mb-12">
            <time
              dateTime={post.date}
              className="text-sm text-mistio-gray block mb-3"
            >
              {new Date(post.date).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </time>
            <h1 className="text-4xl md:text-5xl font-bold text-mistio-dark leading-tight tracking-tight mb-4">
              {post.title}
            </h1>
            <p className="text-xl text-mistio-gray leading-relaxed">
              {post.description}
            </p>
          </header>

          <div className="prose prose-lg prose-slate max-w-none prose-headings:text-mistio-dark prose-headings:font-bold prose-a:text-mistio-teal prose-a:no-underline hover:prose-a:underline prose-strong:text-mistio-dark prose-th:text-left prose-th:text-mistio-dark prose-th:font-semibold prose-td:text-slate-600 prose-table:border-collapse prose-th:border prose-th:border-slate-200 prose-th:px-4 prose-th:py-2 prose-td:border prose-td:border-slate-200 prose-td:px-4 prose-td:py-2">
            <MDXRemote source={post.content} options={{ mdxOptions: { remarkPlugins: [remarkGfm] } }} />
          </div>

          <div className="mt-16 p-8 bg-slate-50 rounded-2xl text-center">
            <h3 className="text-2xl font-bold text-mistio-dark mb-2">
              Ready to see Mistio in action?
            </h3>
            <p className="text-mistio-gray mb-6">
              We ship you a sensor. You mount it. No wiring, no IT.
            </p>
            <Link
              href="/#contact"
              className="inline-block bg-mistio-teal hover:bg-teal-600 text-white font-semibold px-8 py-3 rounded-lg transition-colors"
            >
              Book a Demo
            </Link>
          </div>
        </article>
      </main>
      <StackedCircularFooter />
    </>
  );
}

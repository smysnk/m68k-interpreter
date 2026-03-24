import dynamic from 'next/dynamic';

const IdeApp = dynamic(() => import('@/components/App'), {
  ssr: false,
});

export default IdeApp;

import AuthShell from '@/components/AuthShell';

export const metadata = {
  title: 'Sign In | FX Analyzer Pro',
  description: 'Sign in to your algorithmic FX trading terminal.',
};

export default function LoginPage() {
  return <AuthShell mode="login" />;
}
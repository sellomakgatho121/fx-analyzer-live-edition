import AuthShell from '@/components/AuthShell';

export const metadata = {
  title: 'Create Account | FX Analyzer Pro',
  description: 'Set up your algorithmic FX trading workspace.',
};

export default function RegisterPage() {
  return <AuthShell mode="register" />;
}
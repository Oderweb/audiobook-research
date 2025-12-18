import './globals.css';

export const metadata = {
  title: 'Audiobook Market Research',
  description: 'Analyze audiobook keywords on Spotify',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
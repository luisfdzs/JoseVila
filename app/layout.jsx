export const metadata = {
  title: "José Vila",
  description: "Web de José Vila",
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}

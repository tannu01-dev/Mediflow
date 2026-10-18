import "./globals.css";

export const metadata = {
  title: "MediFlow | Hospital Operations",
  description: "A connected workspace for hospital operations and clinical teams.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

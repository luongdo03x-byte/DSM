import './globals.css';

export const metadata={
  title:'DSM — Quản lý Social Dropship',
  description:'Bảng điều khiển quản lý nội dung và xuất bản đa nền tảng'
};

export default function RootLayout({children}:{children:React.ReactNode}){
  return <html lang="vi"><body>{children}</body></html>;
}

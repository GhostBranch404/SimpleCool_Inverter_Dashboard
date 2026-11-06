import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title:'Home Energy', description:'Your battery, home, grid and solar at a glance.', manifest:'/manifest.webmanifest', icons:{icon:'/favicon.svg',apple:'/icon.svg'}, appleWebApp:{capable:true,statusBarStyle:'black-translucent',title:'Home Energy'}};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="en"><body>{children}</body></html>}

import Image from 'next/image';
import logo from '@/erpIMG/logo.png';

/* The company emblem, one definition shared by the sidebar rail and the top
   bar. The source screenshot had the disc on a white page with further
   artwork touching it on the right; public/images/logo.png is that disc cut
   out on a transparent background, so it sits on the dark rail and on the
   white top bar without a plate behind it. */
export default function BrandMark({ size = 32 }) {
  return (
    <Image
      src={logo}
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      priority
      className="block shrink-0"
    />
  );
}

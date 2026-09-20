import { useEffect, useState } from 'react';

/** 监听媒体查询（SSR/无 matchMedia 时回落 false） */
export function useMediaQuery(query: string): boolean {
  const [hit, setHit] = useState(() =>
    typeof matchMedia === 'function' ? matchMedia(query).matches : false,
  );
  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const mq = matchMedia(query);
    const onChange = () => setHit(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);
  return hit;
}

/** 手机宽度（≤900px，与样表 trip-layout 折叠断点一致） */
export function useIsNarrow(): boolean {
  return useMediaQuery('(max-width: 900px)');
}

import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/ko';

dayjs.extend(relativeTime);
dayjs.locale('ko');

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return '';
  return dayjs(iso).fromNow();
}

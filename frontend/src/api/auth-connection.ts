import { shallowRef } from 'vue';
import { useToast } from '@/composables/use-toast';

export const authConnectionLost = shallowRef(false);
export function markAuthConnectionRestored(): void { authConnectionLost.value = false; }
export function notifyAuthConnectionLost(): void {
  if (authConnectionLost.value) return;
  authConnectionLost.value = true;
  try { useToast().error('Mất kết nối. Phiên đăng nhập được giữ; ứng dụng sẽ thử lại khi có mạng.'); }
  catch { /* Store/bootstrap can run before the toast host has mounted. */ }
}

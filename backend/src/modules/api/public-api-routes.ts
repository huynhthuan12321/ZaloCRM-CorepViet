      for (let i = 0; i < imageUrls.length; i++) {
        const caption = i === 0 && typeof body.caption === 'string' ? body.caption : '';
        let media: { path: string; cleanup: () => Promise<void> } | null = null;

        try {
          media = await downloadMediaToTemp({ url: imageUrls[i] }, 'image');
          await zaloOps.sendImage(account.id, threadId, 0, [media.path], null, caption);
          sent++;
        } catch (err) {
          if (err instanceof ZaloOpError && err.code === 'RATE_LIMITED') {
            return reply.status(429).send({ error: 'rate_limited', sent, threadId });
          }
          if (err instanceof ZaloOpError && err.code === 'NOT_CONNECTED') {
            return reply.status(422).send({ error: 'Zalo account is not connected', sent, threadId });
          }

          failed.push({ index: i, error: String((err as Error)?.message ?? err).slice(0, 300) });
          logger.warn(`[public-api] send-image ảnh #${i} lỗi: ${(err as Error)?.message ?? err}`);
        } finally {
          if (media) await media.cleanup().catch(() => {});
        }
      }
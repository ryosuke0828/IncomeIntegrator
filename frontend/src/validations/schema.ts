import { z } from 'zod';

export const configSchema = z.object({
  days: z.array(z.enum(["月", "火", "水", "木", "金", "土", "日"]))
    .nonempty("少なくとも1つの曜日を選択してください"),
  jobName: z.string()
    .min(1, "仕事名は必須です"),
  startTime: z.string()
    .regex(/^([0-1]\d|2[0-3]):([0-5]\d)$/, "開始時間はHH:mm形式で入力してください"),
  endTime: z.string()
    .regex(/^([0-1]\d|2[0-3]):([0-5]\d)$/, "終了時間はHH:mm形式で入力してください"),
  wage: z.preprocess(arg => {
      const num = parseFloat(arg as string);
      return isNaN(num) ? undefined : num;
    }, z.number().positive("時給は正の値で入力してください")),
  transport: z.preprocess(arg => {
      const num = parseFloat(arg as string);
      return isNaN(num) ? undefined : num;
    }, z.number().min(0, "交通費は0以上で入力してください")),
  allowance: z.preprocess(arg => {
      const num = parseFloat(arg as string);
      return isNaN(num) ? undefined : num;
    }, z.number().min(0, "その他手当は0以上で入力してください"))
});

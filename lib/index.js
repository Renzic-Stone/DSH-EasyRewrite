/**
 * dsh-bubble-edit — node half（骨架）。
 *
 * 当前：最小可加载占位。后续 part 依次加入：
 *  - /bubble/recall、/bubble/edit 路由（forkEngine + boundaryResolver）
 *  - /bubble/backup、/bubble/backup/delete（草稿超时备份）
 */

export const name = 'dsh-bubble-edit'

/** 骨架期无服务依赖；后续按需声明（webServer / sessions / agents / sessionPersistence）。 */
export const inject = []

/** Host 插件体 —— 骨架期无行为。 */
export function apply() {}

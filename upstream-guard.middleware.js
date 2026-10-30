// upstream-guard.middleware.js
// magpie 网关中间件：chat 协议的流式回复中途出现上游错误事件、
// 且已有内容流出时，将其替换为正常收尾块（finish_reason=stop），
// 并把上游报错写进回复正文提示客户端。
// 注意：chat 协议的事件没有名字，故不声明 export const events。

export function onEvent(ev, ctx) {
  if (ctx.protocol !== "chat" || !ctx.stream) return ev
  if (!ev || typeof ev !== "object") return ev

  const ch = ev.choices && ev.choices[0]
  if (ch) {
    const d = ch.delta || {}
    for (const k in d) {
      if (k !== "role" && d[k] !== null && d[k] !== "") {
        ctx.state.saw = true
        break
      }
    }
    if (ch.finish_reason) ctx.state.saw = true
    return ev
  }

  // 流还 held 着（尚无内容流出）时，网关自己会 failover 或在其
  // 全部成员失败后发错误，这里不动它；只处理"内容已流出后"的错误
  if (!ev.error || !ctx.state.saw) return ev

  const e = ev.error
  const msg = typeof e === "string" ? e
    : typeof e.message === "string" && e.message ? e.message
    : JSON.stringify(e)
  const note = (ctx.options && ctx.options.notice) ||
    "[上游端点中断] 上游在回复中途断开，本条回复按正常结束收尾。上游报错："
  console.log(`upstream-guard: mid-stream error after content, ending cleanly: ${msg.slice(0, 300)}`)
  return {
    id: ev.id || "chatcmpl-upstream-interrupted",
    object: "chat.completion.chunk",
    model: ev.model || ctx.model || "",
    choices: [{
      index: 0,
      delta: { content: `\n\n${note}${msg}` },
      finish_reason: "stop",
    }],
  }
}

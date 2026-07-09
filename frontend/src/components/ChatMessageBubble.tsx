import { ChatMessage } from "../types";

export default function ChatMessageBubble({ message, onViewActivity }: { message: ChatMessage; onViewActivity: () => void }) {
  const isUser = message.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-2xl rounded-2xl px-4 py-3 text-sm leading-relaxed ${
          isUser ? "bg-brand-600 text-white" : "border border-slate-800 bg-slate-950 text-slate-100"
        }`}
      >
        <div className="whitespace-pre-wrap">{message.text}</div>
        {!isUser && message.response && (
          <button
            onClick={onViewActivity}
            className="mt-3 inline-flex items-center gap-1 rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:border-brand-400 hover:text-brand-300"
          >
            View agent activity ({message.response.toolCalls.length} tool{message.response.toolCalls.length === 1 ? "" : "s"},{" "}
            {message.response.sources.length} source{message.response.sources.length === 1 ? "" : "s"})
          </button>
        )}
      </div>
    </div>
  );
}

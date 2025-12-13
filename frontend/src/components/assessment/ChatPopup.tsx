"use client";

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Loader2, X, Gavel, ArrowRight } from "lucide-react";
import createDOMPurify from "dompurify";
import { marked } from "marked";
import { cn } from "@/lib/utils";
import type { StreamEvent } from "@/types/api";

const toolLabels: Record<string, string> = {
  web_search: "Searching the web",
  retrieve_dsa_knowledge: "Reading the DSA document",
};

const purifier = typeof window !== "undefined" ? createDOMPurify(window) : null;

function MarkdownContent({ content }: { content: string }) {
  const sanitizedHtml = useMemo(() => {
    const rawHtml = marked.parse(content ?? "", {
      breaks: true,
    }) as string;
    return purifier ? purifier.sanitize(rawHtml) : rawHtml;
  }, [content]);

  return (
    <div
      className="font-sans text-sm leading-relaxed text-[#0a0a0a] whitespace-pre-wrap prose prose-sm max-w-none
        prose-p:my-1.5 prose-ul:my-1.5 prose-ol:my-1.5 prose-li:my-0.5
        prose-headings:text-[#0a0a0a] prose-headings:font-medium
        prose-a:text-[#003399] prose-a:no-underline hover:prose-a:underline
        prose-strong:text-[#0a0a0a] prose-strong:font-medium"
      dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
    />
  );
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

export type ChatPhase =
  | "company_match"
  | "deep_research"
  | "review_scope"
  | "review_size"
  | "review_type"
  | "classify"
  | "report";

export interface ChatContext {
  phase: ChatPhase;
  companyName?: string;
  companyUrl?: string;
  researchData?: {
    geographicalScope?: Array<{
      question: string;
      answer: string;
      confidence: string;
    }>;
    companySize?: Array<{
      question: string;
      answer: string;
      confidence: string;
    }>;
    serviceType?: Array<{
      question: string;
      answer: string;
      confidence: string;
    }>;
  };
  classificationData?: {
    serviceCategory?: string;
    isIntermediary?: boolean;
    isOnlinePlatform?: boolean;
    isMarketplace?: boolean;
    isSearchEngine?: boolean;
    isVLOP?: boolean;
    smeExemption?: boolean;
  };
  complianceData?: {
    applicableObligations?: number;
    totalObligations?: number;
    summary?: string;
  };
}

interface ChatPopupProps {
  context: ChatContext;
}

// Contextual suggestions based on current phase
const phaseSuggestions: Record<ChatPhase, string[]> = {
  company_match: [
    "What is the Digital Services Act?",
    "Which companies are in scope?",
    "What if my company isn't listed?",
  ],
  deep_research: [
    "What data is being collected?",
    "What sources are used?",
    "How is this information verified?",
  ],
  review_scope: [
    "What is territorial scope under Art. 2?",
    "How is EU presence determined?",
    "What constitutes offering services to EU?",
  ],
  review_size: [
    "What are the DSA size thresholds?",
    "What is VLOP/VLOSE designation?",
    "What is the SME exemption?",
  ],
  review_type: [
    "What is an intermediary service?",
    "What distinguishes hosting from platforms?",
    "What qualifies as an online marketplace?",
  ],
  classify: [
    "What service categories exist?",
    "How is classification determined?",
    "What about multiple service types?",
  ],
  report: [
    "Explain these obligations",
    "What are the compliance deadlines?",
    "What are the penalties for non-compliance?",
  ],
};

// Contextual welcome messages
const phaseWelcomes: Record<ChatPhase, string> = {
  company_match:
    "I can assist with company identification and DSA applicability questions.",
  deep_research:
    "Research in progress. I can clarify DSA provisions or assessment methodology.",
  review_scope:
    "Reviewing territorial scope pursuant to Article 2 DSA. I can explain the criteria.",
  review_size:
    "Reviewing size classification. I can clarify thresholds and exemptions.",
  review_type: "Reviewing service classification under Articles 3-6 DSA.",
  classify:
    "Determining applicable obligations based on service classification.",
  report:
    "Compliance assessment complete. I can explain any obligations or provisions.",
};

// Contextual hints for the FAB - specific to what user is doing
const phaseHints: Record<ChatPhase, string> = {
  company_match: "Can't find your company? I can help",
  deep_research: "What is being researched and why?",
  review_scope: "Not sure if you operate in the EU?",
  review_size: "Unsure about employee or revenue thresholds?",
  review_type: "What type of service do you provide?",
  classify: "How will my service be classified?",
  report: "What do these obligations mean for you?",
};

const API_BASE_URL =
  process.env.NODE_ENV === "development"
    ? "http://localhost:8001"
    : process.env.NEXT_PUBLIC_API_URL ||
      "https://snip-tool-backend.onrender.com";

// Build the full context string from ChatContext
function buildContextString(context: ChatContext): string {
  const parts: string[] = [];

  // Current phase
  const phaseLabels: Record<ChatPhase, string> = {
    company_match: "Company Lookup",
    deep_research: "Deep Research in Progress",
    review_scope: "Reviewing Geographical Scope",
    review_size: "Reviewing Company Size",
    review_type: "Reviewing Service Type",
    classify: "Service Classification",
    report: "Compliance Report",
  };

  parts.push(`Current Step: ${phaseLabels[context.phase]}`);

  // Company info
  if (context.companyName) {
    parts.push(`Company: ${context.companyName}`);
    if (context.companyUrl) {
      parts.push(`Website: ${context.companyUrl}`);
    }
  }

  // Research data
  if (context.researchData) {
    const { geographicalScope, companySize, serviceType } =
      context.researchData;

    if (geographicalScope && geographicalScope.length > 0) {
      parts.push("\n--- Geographical Scope Findings ---");
      geographicalScope.forEach((item) => {
        parts.push(`Q: ${item.question}`);
        parts.push(`A: ${item.answer} (${item.confidence} confidence)`);
      });
    }

    if (companySize && companySize.length > 0) {
      parts.push("\n--- Company Size Findings ---");
      companySize.forEach((item) => {
        parts.push(`Q: ${item.question}`);
        parts.push(`A: ${item.answer} (${item.confidence} confidence)`);
      });
    }

    if (serviceType && serviceType.length > 0) {
      parts.push("\n--- Service Type Findings ---");
      serviceType.forEach((item) => {
        parts.push(`Q: ${item.question}`);
        parts.push(`A: ${item.answer} (${item.confidence} confidence)`);
      });
    }
  }

  // Classification data
  if (context.classificationData) {
    const c = context.classificationData;
    parts.push("\n--- DSA Classification ---");
    if (c.serviceCategory) {
      parts.push(`Service Category: ${c.serviceCategory}`);
    }
    if (c.isIntermediary !== undefined) {
      parts.push(`Is Intermediary Service: ${c.isIntermediary ? "Yes" : "No"}`);
    }
    if (c.isOnlinePlatform !== undefined) {
      parts.push(`Is Online Platform: ${c.isOnlinePlatform ? "Yes" : "No"}`);
    }
    if (c.isMarketplace !== undefined) {
      parts.push(`Is Marketplace: ${c.isMarketplace ? "Yes" : "No"}`);
    }
    if (c.isSearchEngine !== undefined) {
      parts.push(`Is Search Engine: ${c.isSearchEngine ? "Yes" : "No"}`);
    }
    if (c.isVLOP !== undefined) {
      parts.push(`Is VLOP/VLOSE: ${c.isVLOP ? "Yes" : "No"}`);
    }
    if (c.smeExemption !== undefined) {
      parts.push(
        `SME Exemption: ${c.smeExemption ? "Eligible" : "Not Eligible"}`
      );
    }
  }

  // Compliance data
  if (context.complianceData) {
    const comp = context.complianceData;
    parts.push("\n--- Compliance Summary ---");
    if (
      comp.applicableObligations !== undefined &&
      comp.totalObligations !== undefined
    ) {
      parts.push(
        `Applicable Obligations: ${comp.applicableObligations} out of ${comp.totalObligations}`
      );
    }
    if (comp.summary) {
      parts.push(`Summary: ${comp.summary}`);
    }
  }

  return parts.join("\n");
}

export function ChatPopup({ context }: ChatPopupProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showHint, setShowHint] = useState(true);

  // Get contextual welcome message
  const welcomeMessage = useMemo(() => {
    const baseWelcome =
      phaseWelcomes[context.phase] || phaseWelcomes.company_match;
    if (context.companyName && context.phase !== "company_match") {
      return `Working on **${context.companyName}**. ${baseWelcome}`;
    }
    return baseWelcome;
  }, [context.phase, context.companyName]);

  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content: welcomeMessage,
      timestamp: new Date(),
    },
  ]);

  const previousPhaseRef = useRef<ChatPhase>(context.phase);

  // Reset messages when phase changes
  useEffect(() => {
    if (previousPhaseRef.current !== context.phase) {
      // Phase changed - reset chat with new welcome message
      setMessages([
        {
          id: "welcome",
          role: "assistant",
          content: welcomeMessage,
          timestamp: new Date(),
        },
      ]);
      setInput("");
      setIsStreaming(false);
      setStreamingContent("");
      setCurrentTool(null);
      previousPhaseRef.current = context.phase;
    } else {
      // Only phase didn't change, just update welcome if it's still the only message
      setMessages((prev) => {
        if (prev.length === 1 && prev[0].id === "welcome") {
          return [
            {
              id: "welcome",
              role: "assistant",
              content: welcomeMessage,
              timestamp: new Date(),
            },
          ];
        }
        return prev;
      });
    }
  }, [context.phase, welcomeMessage]);

  // Get contextual suggestions
  const suggestions = useMemo(() => {
    return phaseSuggestions[context.phase] || phaseSuggestions.company_match;
  }, [context.phase]);

  // Get contextual hint
  const hint = useMemo(() => {
    return phaseHints[context.phase] || "Need help?";
  }, [context.phase]);

  // Build full context string
  const fullContext = useMemo(() => {
    return buildContextString(context);
  }, [context]);

  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [currentTool, setCurrentTool] = useState<string | null>(null);
  const [hasUnread, setHasUnread] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingContent]);

  // Focus input when opening
  useEffect(() => {
    if (isOpen) {
      setHasUnread(false);
      setShowHint(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Hide hint after a delay
  useEffect(() => {
    const timer = setTimeout(() => setShowHint(false), 8000);
    return () => clearTimeout(timer);
  }, [context.phase]);

  // Show hint again when phase changes
  useEffect(() => {
    if (!isOpen) {
      setShowHint(true);
    }
  }, [context.phase, isOpen]);

  const handleSend = useCallback(
    async (messageText?: string) => {
      const text = messageText || input;
      if (!text.trim() || isStreaming) return;

      const userMessage: Message = {
        id: Date.now().toString(),
        role: "user",
        content: text.trim(),
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, userMessage]);
      setInput("");
      setIsStreaming(true);
      setStreamingContent("");

      try {
        const response = await fetch(
          `${API_BASE_URL}/agents/main_agent/stream`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              message: userMessage.content,
              frontend_context: fullContext,
            }),
          }
        );

        if (!response.ok) {
          throw new Error(`API Error: ${response.status}`);
        }

        if (!response.body) {
          throw new Error("No response body");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let fullContent = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6);
              try {
                const event = JSON.parse(data) as StreamEvent;

                switch (event.type) {
                  case "token":
                    fullContent += event.content;
                    setStreamingContent(fullContent);
                    break;
                  case "tool_start":
                    setCurrentTool(event.name);
                    break;
                  case "tool_end":
                    setCurrentTool(null);
                    break;
                  case "error":
                  case "done":
                    setCurrentTool(null);
                    break;
                }
              } catch {
                // Skip invalid JSON
              }
            }
          }
        }

        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content:
            fullContent || "I apologize, but I couldn't generate a response.",
          timestamp: new Date(),
        };

        setMessages((prev) => [...prev, assistantMessage]);

        // Show unread indicator if chat is closed
        if (!isOpen) {
          setHasUnread(true);
        }
      } catch (err) {
        const errorMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content:
            "I apologize, but I encountered an error. Please ensure the backend server is running.",
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, errorMessage]);
      } finally {
        setIsStreaming(false);
        setStreamingContent("");
        setCurrentTool(null);
      }
    },
    [input, isStreaming, fullContext, isOpen]
  );

  const handleSuggestionClick = (suggestion: string) => {
    setInput(suggestion);
    handleSend(suggestion);
  };

  return (
    <>
      {/* Floating Action Button */}
      <AnimatePresence>
        {!isOpen && (
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 20 }}
            onClick={() => setIsOpen(true)}
            className={cn(
              "fixed bottom-6 right-6 z-50",
              "w-12 h-12",
              "bg-[#0a0a0a] text-white",
              "flex items-center justify-center",
              "shadow-lg hover:shadow-xl",
              "hover:bg-[#1a1a1a] transition-all duration-200",
              "focus:outline-none focus:ring-2 focus:ring-[#0a0a0a] focus:ring-offset-2",
              "group"
            )}
            aria-label="Open Corinna"
          >
            <Gavel className="w-5 h-5 transition-transform group-hover:scale-105" />
            {hasUnread && (
              <span className="absolute -top-1 -right-1 w-3 h-3 bg-[#003399] border-2 border-white" />
            )}
          </motion.button>
        )}
      </AnimatePresence>

      {/* Contextual Hint Tooltip */}
      <AnimatePresence>
        {!isOpen && showHint && (
          <motion.div
            initial={{ opacity: 0, x: 10, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 10, scale: 0.95 }}
            transition={{ delay: 0.5, duration: 0.3 }}
            className="fixed bottom-8 right-22 z-40 hidden sm:block"
          >
            <div
              className="bg-white px-3 py-2 shadow-md border border-[#e7e5e4] cursor-pointer hover:bg-[#fafaf9] transition-colors"
              onClick={() => setIsOpen(true)}
            >
              <div className="flex items-center gap-2">
                <Gavel className="w-3.5 h-3.5 text-[#003399]" />
                <span className="text-xs text-[#57534e] font-medium">
                  {hint}
                </span>
                <ArrowRight className="w-3 h-3 text-[#a8a29e]" />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chat Window */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className={cn(
              "fixed bottom-6 right-6 z-50",
              "w-[380px] h-[520px]",
              "bg-white shadow-2xl",
              "border border-[#e7e5e4]",
              "flex flex-col overflow-hidden",
              // Mobile: full screen with padding
              "max-sm:inset-3 max-sm:w-auto max-sm:h-auto max-sm:bottom-3 max-sm:right-3"
            )}
          >
            {/* Header */}
            <div className="shrink-0 px-4 py-3 border-b border-[#e7e5e4] bg-[#fafaf9] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-[#0a0a0a] flex items-center justify-center">
                  <Gavel className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h3 className="font-serif text-sm text-[#0a0a0a]">Corinna</h3>
                  <p className="font-mono text-[10px] text-[#78716c] uppercase tracking-wider">
                    DSA Compliance
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className={cn(
                  "w-7 h-7",
                  "flex items-center justify-center",
                  "text-[#78716c] hover:text-[#0a0a0a]",
                  "hover:bg-[#f5f5f4]",
                  "transition-colors duration-200"
                )}
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              <AnimatePresence initial={false}>
                {messages.map((message) => (
                  <motion.div
                    key={message.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                    className={cn(
                      "flex gap-2",
                      message.role === "user" ? "justify-end" : "justify-start"
                    )}
                  >
                    <div
                      className={cn(
                        "max-w-[85%] px-3 py-2",
                        message.role === "user"
                          ? "bg-[#0a0a0a] text-white"
                          : "bg-[#f5f5f4] text-[#0a0a0a] border border-[#e7e5e4]"
                      )}
                    >
                      {message.role === "assistant" ? (
                        <MarkdownContent content={message.content} />
                      ) : (
                        <p className="font-sans text-sm leading-relaxed whitespace-pre-wrap">
                          {message.content}
                        </p>
                      )}
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>

              {/* Tool indicator */}
              <AnimatePresence>
                {currentTool && (
                  <motion.div
                    key={currentTool}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    className="flex gap-2 justify-start"
                  >
                    <div className="max-w-[85%] px-3 py-1.5 bg-[#003399]/5 border border-[#003399]/10 text-[#003399] flex items-center gap-2">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      <span className="font-mono text-[10px] uppercase tracking-wider">
                        {toolLabels[currentTool] || `Using ${currentTool}`}
                      </span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Streaming message */}
              {isStreaming && streamingContent && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex gap-2 justify-start"
                >
                  <div className="max-w-[85%] px-3 py-2 bg-[#f5f5f4] border border-[#e7e5e4]">
                    <div className="font-sans text-sm text-[#0a0a0a] leading-relaxed whitespace-pre-wrap">
                      <MarkdownContent content={streamingContent} />
                      <span className="inline-block w-0.5 h-4 bg-[#0a0a0a] ml-0.5 animate-pulse align-middle" />
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Loading indicator when no content yet */}
              {isStreaming && !streamingContent && !currentTool && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex gap-2 justify-start"
                >
                  <div className="px-3 py-2 bg-[#f5f5f4] border border-[#e7e5e4] flex gap-1.5">
                    <span
                      className="w-1.5 h-1.5 bg-[#78716c] animate-pulse"
                      style={{ animationDelay: "0ms" }}
                    />
                    <span
                      className="w-1.5 h-1.5 bg-[#78716c] animate-pulse"
                      style={{ animationDelay: "150ms" }}
                    />
                    <span
                      className="w-1.5 h-1.5 bg-[#78716c] animate-pulse"
                      style={{ animationDelay: "300ms" }}
                    />
                  </div>
                </motion.div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Quick suggestions (only when no messages sent yet) */}
            {messages.length === 1 && (
              <div className="shrink-0 px-4 pb-3 border-t border-[#e7e5e4] pt-3 bg-[#fafaf9]">
                <p className="font-mono text-[10px] text-[#78716c] mb-2 uppercase tracking-wider">
                  Common questions
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {suggestions.map((suggestion) => (
                    <button
                      key={suggestion}
                      onClick={() => handleSuggestionClick(suggestion)}
                      className={cn(
                        "px-2.5 py-1 text-xs",
                        "bg-white text-[#57534e]",
                        "border border-[#e7e5e4]",
                        "hover:bg-[#0a0a0a] hover:text-white hover:border-[#0a0a0a]",
                        "transition-colors duration-150"
                      )}
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Input */}
            <div className="shrink-0 p-3 border-t border-[#e7e5e4] bg-[#fafaf9]">
              <div className="flex gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) =>
                    e.key === "Enter" && !e.shiftKey && handleSend()
                  }
                  placeholder="Ask about the DSA..."
                  disabled={isStreaming}
                  className={cn(
                    "flex-1 h-10 px-3",
                    "bg-white border border-[#e7e5e4]",
                    "font-sans text-sm text-[#0a0a0a] placeholder:text-[#a8a29e]",
                    "focus:outline-none focus:border-[#0a0a0a]",
                    "transition-colors duration-150",
                    "disabled:opacity-50"
                  )}
                />
                <button
                  onClick={() => handleSend()}
                  disabled={!input.trim() || isStreaming}
                  className={cn(
                    "w-10 h-10 flex items-center justify-center",
                    "bg-[#0a0a0a] text-white",
                    "hover:bg-[#1a1a1a] transition-colors duration-150",
                    "disabled:opacity-40 disabled:cursor-not-allowed"
                  )}
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}


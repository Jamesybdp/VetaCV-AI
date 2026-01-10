
import React, { useState, useRef, useEffect } from 'react';
import { RefinementService, RefinementResult } from '../services/refinementService';

interface RefinementChatProps {
  currentCV: { digitalSummary: string; humanVersion: string };
  onRefinementComplete: (result: RefinementResult) => void;
  userContext?: {
    targetRole?: string;
    targetIndustry?: string;
  };
}

export const RefinementChat: React.FC<RefinementChatProps> = ({
  currentCV,
  onRefinementComplete,
  userContext
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [conversation, setConversation] = useState<Array<{
    type: 'user' | 'ai';
    content: string;
    timestamp: Date;
    data?: any;
  }>>([]);
  const [showQuickActions, setShowQuickActions] = useState(true);
  
  const refinementService = new RefinementService();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Initialize with welcome message
  useEffect(() => {
    if (conversation.length === 0) {
      setConversation([{
        type: 'ai',
        content: "I'm your CV refinement assistant! Tell me what you'd like to change, or try a quick action below. Examples:\n• 'Make it more aggressive for tech roles'\n• 'Add quantification to all achievements'\n• 'Generate interview talking points'",
        timestamp: new Date()
      }]);
    }
  }, []);
  
  // Scroll to bottom of conversation
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [conversation, isOpen]);
  
  const handleSendMessage = async () => {
    if (!message.trim() || isProcessing) return;
    
    const userMessage = message.trim();
    setMessage('');
    
    // Add user message to conversation
    setConversation(prev => [...prev, {
      type: 'user',
      content: userMessage,
      timestamp: new Date()
    }]);
    
    setIsProcessing(true);
    
    try {
      // Call refinement service
      const result = await refinementService.refineCV(userMessage, currentCV, userContext);
      
      // Add AI response to conversation
      setConversation(prev => [...prev, {
        type: 'ai',
        content: result.digitalSummary,
        timestamp: new Date(),
        data: result
      }]);
      
      // Add change log as separate message
      if (result.changeLog && result.changeLog.length > 0) {
        setConversation(prev => [...prev, {
          type: 'ai',
          content: `📋 Changes applied:\n${result.changeLog.map((change, i) => `${i+1}. ${change}`).join('\n')}`,
          timestamp: new Date()
        }]);
      }
      
      // Add suggestions if any
      if (result.suggestions && result.suggestions.length > 0) {
        setConversation(prev => [...prev, {
          type: 'ai',
          content: `💡 Suggestions:\n${result.suggestions.map((suggestion, i) => `${i+1}. ${suggestion}`).join('\n')}`,
          timestamp: new Date()
        }]);
      }
      
      // Call parent handler with result
      onRefinementComplete(result);
      
      // Hide quick actions after first refinement
      setShowQuickActions(false);
      
    } catch (error) {
      console.error('Refinement failed:', error);
      setConversation(prev => [...prev, {
        type: 'ai',
        content: 'Sorry, I encountered an error. Please try a different request or contact support.',
        timestamp: new Date()
      }]);
    } finally {
      setIsProcessing(false);
    }
  };
  
  const handleQuickAction = (command: string) => {
    setMessage(command);
    setTimeout(() => {
      // Small delay to allow state update if needed, but here we can just call logic. 
      // However, handleSendMessage relies on 'message' state which is async.
      // So we set message then manually trigger logic if we want, or better yet:
      // We can just call logic directly. But for consistency with UI:
    }, 0);
    // Actually better to just call logic directly with the command
    // But we need to update UI to show user "sent" it.
    // Let's modify handleSendMessage to accept an optional arg or just set message and let user click send? 
    // No, quick action should send immediately.
    
    // Quick fix for immediate send:
    const userMessage = command;
    setConversation(prev => [...prev, { type: 'user', content: userMessage, timestamp: new Date() }]);
    setIsProcessing(true);
    
    refinementService.refineCV(userMessage, currentCV, userContext)
      .then(result => {
         setConversation(prev => [...prev, {
            type: 'ai',
            content: result.digitalSummary,
            timestamp: new Date(),
            data: result
          }]);
          if (result.changeLog && result.changeLog.length > 0) {
            setConversation(prev => [...prev, {
              type: 'ai',
              content: `📋 Changes applied:\n${result.changeLog.map((change, i) => `${i+1}. ${change}`).join('\n')}`,
              timestamp: new Date()
            }]);
          }
          if (result.suggestions && result.suggestions.length > 0) {
            setConversation(prev => [...prev, {
              type: 'ai',
              content: `💡 Suggestions:\n${result.suggestions.map((suggestion, i) => `${i+1}. ${suggestion}`).join('\n')}`,
              timestamp: new Date()
            }]);
          }
          onRefinementComplete(result);
          setShowQuickActions(false);
      })
      .catch(err => {
         setConversation(prev => [...prev, {
            type: 'ai',
            content: 'Sorry, I encountered an error.',
            timestamp: new Date()
          }]);
      })
      .finally(() => setIsProcessing(false));
  };
  
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };
  
  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };
  
  return (
    <div className={`refinement-chat-container ${isOpen ? 'open' : ''}`}>
      {/* Chat toggle button */}
      <button 
        className="chat-toggle-button"
        onClick={() => setIsOpen(!isOpen)}
      >
        {isOpen ? '✕' : '🛠️ Refine CV'}
      </button>
      
      {/* Chat window */}
      <div className="chat-window">
        <div className="chat-header">
          <h3>VetaCV AI Refinement</h3>
          <p>Transform your CV with natural language</p>
        </div>
        
        <div className="conversation-container custom-scrollbar">
          {conversation.map((msg, index) => (
            <div 
              key={index} 
              className={`message ${msg.type}`}
            >
              <div className="message-header">
                <span className="message-type">
                  {msg.type === 'user' ? 'You' : 'VetaCV AI'}
                </span>
                <span className="message-time">
                  {formatTime(msg.timestamp)}
                </span>
              </div>
              <div className="message-content">
                {msg.content.split('\n').map((line, i) => (
                  <React.Fragment key={i}>
                    {line}
                    {i < msg.content.split('\n').length - 1 && <br />}
                  </React.Fragment>
                ))}
              </div>
              
              {/* Show action buttons for AI messages with data */}
              {msg.type === 'ai' && msg.data && (
                <div className="message-actions">
                  {/* Changes are automatically applied in this version, but we can show visual feedback */}
                  {msg.data.additionalFormats?.interviewPoints && (
                    <button 
                      className="action-button"
                      onClick={() => {
                        const points = msg.data.additionalFormats.interviewPoints;
                        alert(`Interview Points:\n\n${points.join('\n• ')}`);
                      }}
                    >
                      💬 View Interview Points
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
          
          {/* Quick actions for first-time users */}
          {showQuickActions && conversation.length <= 2 && (
            <div className="quick-actions-section">
              <p className="quick-actions-label">Try one of these:</p>
              <div className="quick-actions-grid">
                {refinementService.getQuickPresets().slice(0, 4).map(preset => (
                  <button
                    key={preset.id}
                    className="quick-action-button"
                    onClick={() => handleQuickAction(preset.command)}
                    disabled={isProcessing}
                  >
                    <span className="quick-action-icon">{preset.icon}</span>
                    <span className="quick-action-label">{preset.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          
          {isProcessing && (
             <div className="message ai">
                <div className="message-content">
                   <div className="flex gap-2 p-2">
                      <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{animationDelay: '0ms'}}></div>
                      <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{animationDelay: '150ms'}}></div>
                      <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{animationDelay: '300ms'}}></div>
                   </div>
                </div>
             </div>
          )}
          <div ref={messagesEndRef} />
        </div>
        
        {/* Message input */}
        <div className="message-input-container">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Type your refinement request... (e.g., 'Make it more aggressive for tech roles')"
            disabled={isProcessing}
            rows={2}
          />
          <button 
            onClick={handleSendMessage}
            disabled={!message.trim() || isProcessing}
            className="send-button"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
};

import React from 'react';

interface NotificationProps {
  message: string;
  onClose: () => void;
}

export default function Notification({ message, onClose }: NotificationProps) {
  return (
    <div className="fixed top-4 right-4 z-50 rounded-md bg-fiddo-orange px-4 py-2 text-white shadow">
      <div className="flex items-center gap-2">
        <span>{message}</span>
        <button onClick={onClose} className="font-bold hover:text-gray-200">✕</button>
      </div>
    </div>
  );
}

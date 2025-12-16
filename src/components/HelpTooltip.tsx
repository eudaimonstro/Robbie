import React, { useState } from 'react';
import { HelpCircle, X, CheckCircle, XCircle } from 'lucide-react';

export function HelpTooltip({ motion }) {
  const [show, setShow] = useState(false);

  return (
    <div className="relative">
      <button onClick={() => setShow(!show)} className="text-gray-400 hover:text-gray-600">
        <HelpCircle size={16}/>
      </button>
      {show && (
        <div className="absolute z-50 left-0 top-6 w-72 bg-white border rounded-lg shadow-xl p-4 text-sm">
          <div className="flex justify-between mb-2">
            <span className="font-semibold">{motion.name}</span>
            <button onClick={() => setShow(false)} className="text-gray-400">
              <X size={14}/>
            </button>
          </div>
          <p className="text-gray-600 mb-2">{motion.help}</p>
          <p className="text-gray-500 italic text-xs mb-2">"{motion.phrase}"</p>
          <p className="text-xs text-gray-600"><strong>When to use:</strong> {motion.whenToUse}</p>
          <div className="grid grid-cols-2 gap-1 mt-2 text-xs border-t pt-2">
            <span className={motion.needsSecond ? "text-green-600" : "text-gray-400"}>
              {motion.needsSecond ? <CheckCircle size={12} className="inline mr-1"/> : <XCircle size={12} className="inline mr-1"/>}
              Second
            </span>
            <span className={motion.debatable ? "text-green-600" : "text-gray-400"}>
              {motion.debatable ? <CheckCircle size={12} className="inline mr-1"/> : <XCircle size={12} className="inline mr-1"/>}
              Debatable
            </span>
            <span className={motion.amendable ? "text-green-600" : "text-gray-400"}>
              {motion.amendable ? <CheckCircle size={12} className="inline mr-1"/> : <XCircle size={12} className="inline mr-1"/>}
              Amendable
            </span>
            <span className="text-gray-700">
              Vote: {motion.vote === "2/3" ? "⅔" : motion.vote === "majority" ? "Majority" : "None"}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

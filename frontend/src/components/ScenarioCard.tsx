'use client';

import React from 'react';

interface ScenarioCardProps {
    id: string;
    name: string;
    description: string;
    isSelected: boolean;
    onSelect: () => void;
    icon: string;
}

const ScenarioCard: React.FC<ScenarioCardProps> = ({ name, description, isSelected, onSelect, icon }) => {
    return (
        <div
            onClick={onSelect}
            className={`glass-card p-6 cursor-pointer flex flex-col gap-3 group ${isSelected ? 'selected' : ''}`}
        >
            <div className={`text-3xl transition-transform duration-300 group-hover:scale-110`}>
                {icon}
            </div>
            <div>
                <h3 className={`text-xl font-bold transition-colors ${isSelected ? 'text-indigo-400' : 'text-slate-200'}`}>
                    {name}
                </h3>
                <p className="text-slate-400 text-sm leading-relaxed mt-1">
                    {description}
                </p>
            </div>
        </div>
    );
};

export default ScenarioCard;

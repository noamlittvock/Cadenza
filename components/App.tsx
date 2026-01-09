import React, { useState, useEffect } from 'react';
import { ViewState, Teacher, Room, CalendarEvent, GanttBlock, AppSettings, ListsState } from '../types';
import { INITIAL_TEACHERS, INITIAL_ROOMS, INITIAL_EVENTS, INITIAL_GANTT, INITIAL_SETTINGS, INITIAL_LISTS } from '../constants';
import { Layout } from './components/Layout';
import { TeacherManager } from './components/TeacherManager';
import { RoomManager } from './components/RoomManager';
import { CalendarView } from './components/CalendarView';
import { GanttManager } from './components/GanttManager';
import { FinancialDashboard } from './components/FinancialDashboard';
import { Settings } from './components/Settings';
import { ManageLists } from './components/ManageLists';

export default function App() {
  const [currentView, setCurrentView] = useState<ViewState>('CALENDAR');
  const [darkMode, setDarkMode] = useState(false);

  // Core State (Simulating Database)
  const [teachers, setTeachers] = useState<Teacher[]>(() => {
    const saved = localStorage.getItem('teachers');
    // Migration: ensure tags exist if loading old data
    const parsed = saved ? JSON.parse(saved) : INITIAL_TEACHERS;
    return parsed.map((t: any) => ({...t, tags: t.tags || []}));
  });

  const [rooms, setRooms] = useState<Room[]>(() => {
    const saved = localStorage.getItem('rooms');
    return saved ? JSON.parse(saved) : INITIAL_ROOMS;
  });

  const [events, setEvents] = useState<CalendarEvent[]>(() => {
    const saved = localStorage.getItem('events');
    return saved ? JSON.parse(saved) : INITIAL_EVENTS;
  });

  const [ganttBlocks, setGanttBlocks] = useState<GanttBlock[]>(() => {
    const saved = localStorage.getItem('ganttBlocks');
    return saved ? JSON.parse(saved) : INITIAL_GANTT;
  });
  
  const [settings, setSettings] = useState<AppSettings>(() => {
    const saved = localStorage.getItem('settings');
    return saved ? JSON.parse(saved) : INITIAL_SETTINGS;
  });

  const [lists, setLists] = useState<ListsState>(() => {
    const saved = localStorage.getItem('lists');
    return saved ? JSON.parse(saved) : INITIAL_LISTS;
  });

  // Persistence Effects
  useEffect(() => localStorage.setItem('teachers', JSON.stringify(teachers)), [teachers]);
  useEffect(() => localStorage.setItem('rooms', JSON.stringify(rooms)), [rooms]);
  useEffect(() => localStorage.setItem('events', JSON.stringify(events)), [events]);
  useEffect(() => localStorage.setItem('ganttBlocks', JSON.stringify(ganttBlocks)), [ganttBlocks]);
  useEffect(() => localStorage.setItem('settings', JSON.stringify(settings)), [settings]);
  useEffect(() => localStorage.setItem('lists', JSON.stringify(lists)), [lists]);

  // Dark Mode Effect
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  // Route Rendering
  const renderContent = () => {
    switch (currentView) {
      case 'CALENDAR':
        return (
          <CalendarView 
            events={events} 
            setEvents={setEvents} 
            teachers={teachers} 
            rooms={rooms} 
            ganttBlocks={ganttBlocks}
            setGanttBlocks={setGanttBlocks}
            settings={settings}
            lists={lists}
          />
        );
      case 'TEACHERS':
        return <TeacherManager teachers={teachers} setTeachers={setTeachers} lists={lists} />;
      case 'ROOMS':
        return <RoomManager rooms={rooms} setRooms={setRooms} />;
      case 'GANTT':
        return (
          <GanttManager 
            blocks={ganttBlocks} 
            setBlocks={setGanttBlocks} 
            events={events} 
            setEvents={setEvents} 
          />
        );
      case 'FINANCIAL':
        return <FinancialDashboard events={events} teachers={teachers} settings={settings} />;
      case 'SETTINGS':
        return <Settings settings={settings} setSettings={setSettings} />;
      case 'LISTS':
        return <ManageLists lists={lists} setLists={setLists} />;
      default:
        return <div>Not found</div>;
    }
  };

  return (
    <Layout currentView={currentView} setView={setCurrentView} darkMode={darkMode} toggleDarkMode={() => setDarkMode(!darkMode)}>
      {renderContent()}
    </Layout>
  );
}

import { useState, useEffect } from 'react';

type Listener = () => void;

class GameState {
  health: number = 20; // 0 to 20
  food: number = 20; // 0 to 20
  exhaustion: number = 0; // 0 to 4
  gameMode: string = 'survival';
  onTimeSet: ((time: 'day' | 'night') => void) | null = null;
  
  private listeners: Set<Listener> = new Set();
  
  subscribe(listener: Listener) {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  notify() {
    this.listeners.forEach(l => l());
  }

  isCreative() {
    return this.gameMode === 'creative' || this.gameMode === 'creativo';
  }

  setHealth(val: number) {
    if (this.isCreative()) {
      val = 20;
    }
    const oldInt = Math.ceil(this.health);
    this.health = Math.max(0, Math.min(20, val));
    if (Math.ceil(this.health) !== oldInt) {
      this.notify();
    }
  }

  setFood(val: number) {
    if (this.isCreative()) {
      val = 20;
    }
    const oldInt = Math.ceil(this.food);
    this.food = Math.max(0, Math.min(20, val));
    if (Math.ceil(this.food) !== oldInt) {
      this.notify();
    }
  }

  addExhaustion(amount: number) {
    if (this.isCreative()) return;
    this.exhaustion += amount;
    if (this.exhaustion >= 4.0) {
      this.exhaustion -= 4.0;
      if (this.food > 0) {
        this.setFood(this.food - 1);
      }
    }
  }

  applyStarvation(delta: number) {
    if (this.isCreative()) {
      this.health = 20;
      this.food = 20;
      return;
    }
    if (this.food <= 0) {
      // Starvation damage
      this.setHealth(this.health - delta * 0.5); // lose 0.5 health per second
    } else if (this.food >= 18 && this.health < 20) {
       // Regeneration
       this.setHealth(this.health + delta * 0.2); // gain 0.2 health per second
    }
  }

  eat(amount: number) {
    this.setFood(this.food + amount);
  }
}

export const gameState = new GameState();

export function useGameState() {
  const [state, setState] = useState({ health: Math.ceil(gameState.health), food: Math.ceil(gameState.food) });

  useEffect(() => {
    return gameState.subscribe(() => {
      setState({ health: Math.ceil(gameState.health), food: Math.ceil(gameState.food) });
    });
  }, []);

  return state;
}

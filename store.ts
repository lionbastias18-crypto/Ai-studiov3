import { useState, useEffect } from 'react';

type Listener = () => void;

class GameState {
  health: number = 20; // 0 to 20
  food: number = 20; // 0 to 20
  air: number = 20; // 0 to 20 underwater oxygen
  exhaustion: number = 0; // 0 to 4
  gameMode: string = 'survival';
  isInWater: boolean = false;
  isUnderwater: boolean = false;
  aquaticPerk: boolean = false;
  onTimeSet: ((time: 'day' | 'night') => void) | null = null;
  
  private listeners: Set<Listener> = new Set();
  private drownTimer: number = 0;
  
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

  setAquaticPerk(enabled: boolean) {
    if (this.aquaticPerk !== enabled) {
      this.aquaticPerk = enabled;
      if (enabled) this.air = 20;
      this.notify();
    }
  }

  updateWaterState(inWater: boolean, underwater: boolean, delta: number): boolean {
    let changed = false;
    let tookDrownDamage = false;

    if (this.isInWater !== inWater) {
      this.isInWater = inWater;
      changed = true;
    }
    if (this.isUnderwater !== underwater) {
      this.isUnderwater = underwater;
      changed = true;
    }

    const oldAirInt = Math.ceil(this.air);
    if (underwater && !this.isCreative() && !this.aquaticPerk) {
      this.air = Math.max(0, this.air - delta * 1.45);
      if (this.air <= 0) {
        this.drownTimer += delta;
        if (this.drownTimer >= 1.0) {
          this.drownTimer = 0;
          this.setHealth(this.health - 2);
          tookDrownDamage = true;
        }
      } else {
        this.drownTimer = 0;
      }
    } else {
      this.drownTimer = 0;
      if (this.air < 20) {
        this.air = Math.min(20, this.air + delta * 14);
      }
    }

    if (Math.ceil(this.air) !== oldAirInt) {
      changed = true;
    }
    if (changed) {
      this.notify();
    }
    return tookDrownDamage;
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

  isRegenerating: boolean = false;
  private regenTimer: number = 0;

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
      this.air = 20;
      this.exhaustion = 0;
      if (this.isRegenerating) {
        this.isRegenerating = false;
        this.notify();
      }
      return;
    }

    if (this.food <= 0) {
      if (this.isRegenerating) {
        this.isRegenerating = false;
        this.notify();
      }
      // Starvation damage when hunger is completely depleted
      this.setHealth(this.health - delta * 0.4);
    } else if (this.food >= 18 && this.health < 20) {
      // Natural health regeneration when well-fed (Minecraft survival loop)
      const wasRegen = this.isRegenerating;
      this.isRegenerating = true;
      if (!wasRegen) {
        this.notify();
      }

      this.regenTimer += delta;
      // Faster healing at full food (20), steady healing at food >= 18
      const threshold = this.food >= 20 ? 2.5 : 3.5;
      if (this.regenTimer >= threshold) {
        this.regenTimer = 0;
        this.setHealth(Math.min(20, this.health + 1));
        // Natural regeneration exhausts the player's hunger reserves
        this.addExhaustion(1.5);
      }
    } else {
      if (this.isRegenerating) {
        this.isRegenerating = false;
        this.notify();
      }
      this.regenTimer = 0;
    }
  }

  eat(amount: number) {
    this.setFood(this.food + amount);
  }
}

export const gameState = new GameState();

export function useGameState() {
  const [state, setState] = useState({ 
    health: Math.ceil(gameState.health), 
    food: Math.ceil(gameState.food),
    air: Math.ceil(gameState.air),
    isInWater: gameState.isInWater,
    isUnderwater: gameState.isUnderwater,
    aquaticPerk: gameState.aquaticPerk,
    isRegenerating: gameState.isRegenerating 
  });

  useEffect(() => {
    return gameState.subscribe(() => {
      setState({ 
        health: Math.ceil(gameState.health), 
        food: Math.ceil(gameState.food),
        air: Math.ceil(gameState.air),
        isInWater: gameState.isInWater,
        isUnderwater: gameState.isUnderwater,
        aquaticPerk: gameState.aquaticPerk,
        isRegenerating: gameState.isRegenerating 
      });
    });
  }, []);

  return state;
}

'use client';

import { useEffect, useState } from 'react';
import { getSocket } from '@/lib/socket';
import { Package, Scroll, Gem, Coins, Sparkles } from 'lucide-react';

interface InventoryItem {
  id: string;
  itemId: string;
  name: string;
  description?: string;
  quantity: number;
  rarity: 'COMMON' | 'UNCOMMON' | 'RARE' | 'EPIC' | 'LEGENDARY';
  type: string;
  iconUrl?: string;
}

interface TreasuryState {
  adena: number;
  ancientCoin: number;
  items: InventoryItem[];
}

const RARITY_COLORS = {
  COMMON: 'text-gray-300 border-gray-500',
  UNCOMMON: 'text-green-400 border-green-500',
  RARE: 'text-blue-400 border-blue-500',
  EPIC: 'text-purple-400 border-purple-500',
  LEGENDARY: 'text-orange-400 border-orange-500',
};

const RARITY_BG = {
  COMMON: 'bg-gray-500/10',
  UNCOMMON: 'bg-green-500/10',
  RARE: 'bg-blue-500/10',
  EPIC: 'bg-purple-500/10',
  LEGENDARY: 'bg-orange-500/10',
};

const TYPE_ICONS: Record<string, React.ReactNode> = {
  SCROLL: <Scroll size={20} />,
  MATERIAL: <Gem size={20} />,
  CURRENCY: <Coins size={20} />,
  default: <Package size={20} />,
};

export default function TreasuryTab() {
  const [treasury, setTreasury] = useState<TreasuryState>({
    adena: 0,
    ancientCoin: 0,
    items: [],
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const socket = getSocket();

    // Request inventory on mount
    socket.emit('inventory:get');

    socket.on('auth:success', (data: any) => {
      setTreasury(prev => ({
        ...prev,
        adena: data.adena || 0,
        ancientCoin: data.ancientCoin || 0,
      }));
    });

    socket.on('inventory:data', (data: { items: InventoryItem[] }) => {
      setTreasury(prev => ({
        ...prev,
        items: data.items,
      }));
      setLoading(false);
    });

    // Update when loot drops
    socket.on('loot:drop', (data: { item: InventoryItem; adena?: number }) => {
      setTreasury(prev => {
        const existingIndex = prev.items.findIndex(i => i.itemId === data.item.itemId);
        let newItems;

        if (existingIndex >= 0) {
          newItems = [...prev.items];
          newItems[existingIndex] = {
            ...newItems[existingIndex],
            quantity: newItems[existingIndex].quantity + data.item.quantity,
          };
        } else {
          newItems = [data.item, ...prev.items];
        }

        return {
          ...prev,
          items: newItems,
          adena: data.adena ?? prev.adena,
        };
      });
    });

    return () => {
      socket.off('auth:success');
      socket.off('inventory:data');
      socket.off('loot:drop');
    };
  }, []);

  const groupedItems = treasury.items.reduce((acc, item) => {
    const type = item.type || 'OTHER';
    if (!acc[type]) acc[type] = [];
    acc[type].push(item);
    return acc;
  }, {} as Record<string, InventoryItem[]>);

  return (
    <div className="flex-1 overflow-auto bg-l2-dark p-4">
      {/* Currency Header */}
      <div className="bg-l2-panel rounded-lg p-4 mb-4">
        <div className="flex items-center gap-3 mb-3">
          <Package className="text-l2-gold" size={28} />
          <div>
            <h2 className="text-lg font-bold text-white">Treasury</h2>
            <p className="text-xs text-gray-400">Your collected loot</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-black/30 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <Coins className="text-l2-gold" size={18} />
              <span className="text-xs text-gray-400">Adena</span>
            </div>
            <p className="text-xl font-bold text-l2-gold">
              {treasury.adena.toLocaleString()}
            </p>
          </div>
          <div className="bg-black/30 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="text-purple-400" size={18} />
              <span className="text-xs text-gray-400">Ancient Coins</span>
            </div>
            <p className="text-xl font-bold text-purple-400">
              {treasury.ancientCoin.toLocaleString()}
            </p>
          </div>
        </div>
      </div>

      {/* Inventory */}
      <div className="bg-l2-panel rounded-lg p-4">
        <h3 className="text-sm text-gray-400 mb-3">Inventory</h3>

        {loading ? (
          <div className="p-8 text-center text-gray-400">Loading...</div>
        ) : treasury.items.length === 0 ? (
          <div className="p-8 text-center text-gray-400">
            <Package size={32} className="mx-auto mb-2 opacity-50" />
            <p>No items yet</p>
            <p className="text-xs mt-1">Defeat bosses to collect loot!</p>
          </div>
        ) : (
          <div className="space-y-4">
            {Object.entries(groupedItems).map(([type, items]) => (
              <div key={type}>
                <div className="text-xs text-gray-500 mb-2 uppercase">{type}</div>
                <div className="grid grid-cols-2 gap-2">
                  {items.map((item) => (
                    <div
                      key={item.id}
                      className={`p-3 rounded-lg border ${RARITY_COLORS[item.rarity]} ${RARITY_BG[item.rarity]}`}
                    >
                      <div className="flex items-start gap-2">
                        <div className={`${RARITY_COLORS[item.rarity]}`}>
                          {TYPE_ICONS[item.type] || TYPE_ICONS.default}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`font-bold text-sm truncate ${RARITY_COLORS[item.rarity].split(' ')[0]}`}>
                            {item.name}
                          </p>
                          <p className="text-xs text-gray-500">x{item.quantity}</p>
                        </div>
                      </div>
                      {item.description && (
                        <p className="text-xs text-gray-400 mt-2 line-clamp-2">
                          {item.description}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

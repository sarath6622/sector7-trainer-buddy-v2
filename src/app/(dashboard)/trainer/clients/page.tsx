'use client';

import { useState, useEffect, useCallback } from 'react';
import { Users, Calendar, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface ClientData {
  clientProfile: {
    id: string;
    fitnessGoals?: string;
    user: {
      firstName: string;
      lastName: string;
      email: string;
      phone?: string;
      profileImageUrl?: string;
    };
  };
  package: {
    id: string;
    sessionsPerMonth: number;
    sessionChargeAmount?: number;
  };
  stats: {
    totalThisMonth: number;
    completed: number;
    noShow: number;
    scheduled: number;
    used: number;
    remaining: number;
  };
  nextSession?: {
    id: string;
    scheduledDate: string;
    scheduledTime: string;
  };
}

export default function TrainerClientsPage() {
  const [clients, setClients] = useState<ClientData[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchClients = useCallback(async () => {
    try {
      const res = await fetch('/api/trainer/clients');
      if (res.ok) {
        const { data } = await res.json();
        setClients(data);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  function formatDate(dateStr: string) {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Users className="h-6 w-6" />
        <h1 className="text-2xl font-bold">My Clients</h1>
        <Badge variant="secondary" className="ml-2">
          {clients.length}
        </Badge>
      </div>

      {clients.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">No clients assigned to you yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {clients.map((item) => (
            <Card key={item.clientProfile.id} className="group cursor-default">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">
                    {item.clientProfile.user.firstName} {item.clientProfile.user.lastName}
                  </CardTitle>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
                {item.clientProfile.fitnessGoals && (
                  <p className="text-xs text-muted-foreground line-clamp-1">
                    {item.clientProfile.fitnessGoals}
                  </p>
                )}
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Session counts */}
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-md bg-muted p-2">
                    <p className="text-lg font-bold">{item.stats.used}</p>
                    <p className="text-[10px] text-muted-foreground">Used</p>
                  </div>
                  <div className="rounded-md bg-muted p-2">
                    <p className="text-lg font-bold">{item.stats.remaining}</p>
                    <p className="text-[10px] text-muted-foreground">Remaining</p>
                  </div>
                  <div className="rounded-md bg-muted p-2">
                    <p className="text-lg font-bold">{item.package.sessionsPerMonth}</p>
                    <p className="text-[10px] text-muted-foreground">Per Month</p>
                  </div>
                </div>

                {/* Next session */}
                {item.nextSession ? (
                  <div className="flex items-center gap-2 rounded-md border border-border/50 p-2">
                    <Calendar className="h-4 w-4 text-primary" />
                    <div className="text-xs">
                      <span className="font-medium">Next: </span>
                      {formatDate(item.nextSession.scheduledDate)} at{' '}
                      {item.nextSession.scheduledTime}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No upcoming sessions</p>
                )}

                {/* No-show warning */}
                {item.stats.noShow > 0 && (
                  <Badge variant="destructive" className="text-[10px]">
                    {item.stats.noShow} no-show{item.stats.noShow > 1 ? 's' : ''} this month
                  </Badge>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

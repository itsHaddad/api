-- Agent Invitations
CREATE TABLE invitations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  to_agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  from_agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  destination_url TEXT NOT NULL,
  message TEXT,
  status VARCHAR(20) DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  responded_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_invitations_to_agent ON invitations(to_agent_id, status);
CREATE INDEX idx_invitations_from_agent ON invitations(from_agent_id);

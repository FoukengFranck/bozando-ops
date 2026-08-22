import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  Button,
  Container,
  Heading,
  Input,
  Label,
  Text,
  Badge,
  FocusModal,
  Textarea,
  RadioGroup,
} from "@medusajs/ui";
import { Plus, CubeSolid, Trash } from "@medusajs/icons";
import { api } from "../lib/api";
import { useMutationToast } from "../lib/useMutationToast";
import { useConfirmDelete } from "../lib/useConfirmDelete";
import { useProvisionLog } from "../lib/useProvisionLog";
import { PageHeader, PageContainer } from "../components/PageHeader";
import { ActionMenu } from "../components/ActionMenu";
import { EmptyState } from "../components/EmptyState";
import { ModalForm } from "../components/ModalForm";
import type { Cluster } from "../lib/api";

const STATUS_COLOR: Record<Cluster["status"], "green" | "orange" | "red"> = {
  ready: "green",
  pending: "orange",
  failed: "red",
};

export function ClustersPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: clusters, isLoading } = useQuery({
    queryKey: ["clusters"],
    queryFn: api.listClusters,
  });
  const { data: serversData } = useQuery({
    queryKey: ["servers"],
    queryFn: api.listServers,
  });


  const [open, setOpen] = useState(false);
  const { lines, clear } = useProvisionLog(open);
  const [newClusterName, setNewClusterName] = useState("");
  const [name, setName] = useState("");
  const [host, setHost] = useState("");
  const [port, setPort] = useState(22);
  const [user, setUser] = useState("root");
  const [credType, setCredType] = useState<"key" | "password">("key");
  const [privateKey, setPrivateKey] = useState("");
  const [password, setPassword] = useState("");

  const provision = useMutationToast({
    mutationFn: () =>
      api.provisionServer({
        name,
        host,
        port,
        user,
        newClusterName,
        credential:
          credType === "key"
            ? { type: "key", privateKey }
            : { type: "password", password },
      }),
    success: t("clusters.toast.creationStarted"),
    invalidate: [["clusters"], ["servers"]],
    onSuccess: () => {
      setPrivateKey("");
      setPassword("");
    },
  });

  const canSubmit =
    newClusterName.trim() &&
    name &&
    host &&
    (credType === "key" ? privateKey : password);

  const serverCountByCluster = new Map<string, number>();
  for (const srv of serversData?.servers ?? []) {
    serverCountByCluster.set(
      srv.clusterId,
      (serverCountByCluster.get(srv.clusterId) ?? 0) + 1,
    );
  }

  const removeCluster = useConfirmDelete<Cluster>({
    mutationFn: (c) => api.deleteCluster(c.id),
    success: (r) => {
      const result = r as Awaited<ReturnType<typeof api.deleteCluster>>;
      return result.removedServers > 0
        ? t("clusters.toast.deleteSuccessWithServers", {
            count: result.removedServers,
          })
        : t("clusters.toast.deleteSuccess");
    },
    invalidate: [["clusters"], ["servers"]],
    confirm: (c) => ({
      title: t("clusters.deleteConfirm.title"),
      description: t("clusters.deleteConfirm.description", {
        name: c.name,
        status: c.status,
      }),
    }),
  });


  const canDelete = (c: Cluster) => c.status !== "ready" && !c.isDefault;

  return (
    <PageContainer>
      <PageHeader
        title={t("clusters.pageTitle")}
        actions={
          <Button
            size="small"
            onClick={() => {
              clear();
              setOpen(true);
            }}
          >
            <Plus /> {t("clusters.actions.create")}
          </Button>
        }
      />

      {isLoading ? (
        <Text className="text-ui-fg-subtle">{t("clusters.loading")}</Text>
      ) : clusters?.length === 0 ? (
        <Container className="p-0">
          <EmptyState
            icon={CubeSolid}
            title={t("clusters.empty.title")}
            description={t("clusters.empty.description")}
            action={
              <Button
                size="small"
                onClick={() => {
                  clear();
                  setOpen(true);
                }}
              >
                <Plus /> {t("clusters.actions.create")}
              </Button>
            }
          />
        </Container>
      ) : (
        <div className="flex flex-col gap-3">
          {clusters?.map((cluster) => (
            <Container
              key={cluster.id}
              className="flex items-center justify-between p-4"
            >
              <button
                type="button"
                onClick={() => navigate(`/clusters/${cluster.id}`)}
                className="flex flex-1 items-center gap-3 text-left"
              >
                <CubeSolid />
                <div>
                  <div className="flex items-center gap-2">
                    <Heading level="h3">{cluster.name}</Heading>
                    {cluster.isDefault && (
                      <Badge size="2xsmall">
                        {t("clusters.badge.default")}
                      </Badge>
                    )}
                    <Badge size="2xsmall" color={STATUS_COLOR[cluster.status]}>
                      {cluster.status}
                    </Badge>
                  </div>
                  <Text size="small" className="text-ui-fg-subtle">
                    {t("clusters.serverCount", {
                      count: serverCountByCluster.get(cluster.id) ?? 0,
                    })}
                  </Text>
                </div>
              </button>
              {canDelete(cluster) && (
                <ActionMenu
                  groups={[
                    {
                      actions: [
                        {
                          label: t("clusters.actions.delete"),
                          icon: <Trash />,
                          variant: "danger" as const,
                          onClick: () => removeCluster(cluster),
                        },
                      ],
                    },
                  ]}
                />
              )}
            </Container>
          ))}
        </div>
      )}

      <FocusModal open={open} onOpenChange={setOpen}>
        <FocusModal.Content>
          <FocusModal.Header>
            <Heading>{t("clusters.createModal.title")}</Heading>
          </FocusModal.Header>
          <FocusModal.Body className="overflow-y-auto">
            <ModalForm
              size="lg"
              onSubmit={() => canSubmit && provision.mutate()}
            >
              <div>
                <Label size="small">
                  {t("clusters.createModal.clusterNameLabel")}
                </Label>
                <Input
                  value={newClusterName}
                  onChange={(e) => setNewClusterName(e.target.value)}
                  placeholder="Cluster EU-2"
                />
              </div>
              <Text size="xsmall" className="text-ui-fg-muted">
                {t("clusters.createModal.hint")}
              </Text>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label size="small">
                    {t("clusters.createModal.serverNameLabel")}
                  </Label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="manager-1"
                  />
                </div>
                <div>
                  <Label size="small">
                    {t("clusters.createModal.hostLabel")}
                  </Label>
                  <Input
                    value={host}
                    onChange={(e) => setHost(e.target.value)}
                    placeholder="203.0.113.10"
                  />
                </div>
                <div>
                  <Label size="small">
                    {t("clusters.createModal.portLabel")}
                  </Label>
                  <Input
                    type="number"
                    value={port}
                    onChange={(e) => setPort(Number(e.target.value))}
                  />
                </div>
                <div>
                  <Label size="small">
                    {t("clusters.createModal.userLabel")}
                  </Label>
                  <Input
                    value={user}
                    onChange={(e) => setUser(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <Label size="small">
                  {t("clusters.createModal.authMethodLabel")}
                </Label>
                <RadioGroup
                  value={credType}
                  onValueChange={(v) => setCredType(v as "key" | "password")}
                >
                  <div className="flex items-center gap-2">
                    <RadioGroup.Item value="key" id="ck-key" />
                    <Label htmlFor="ck-key">
                      {t("clusters.createModal.sshKey")}
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroup.Item value="password" id="ck-pw" />
                    <Label htmlFor="ck-pw">
                      {t("clusters.createModal.password")}
                    </Label>
                  </div>
                </RadioGroup>
              </div>
              {credType === "key" ? (
                <Textarea
                  value={privateKey}
                  onChange={(e) => setPrivateKey(e.target.value)}
                  placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                  rows={5}
                />
              ) : (
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              )}
              <div className="mt-2 flex justify-end gap-2">
                <Button
                  variant="secondary"
                  type="button"
                  onClick={() => setOpen(false)}
                >
                  {t("common.close")}
                </Button>
                <Button
                  type="submit"
                  isLoading={provision.isPending}
                  disabled={!canSubmit}
                >
                  {t("clusters.actions.create")}
                </Button>
              </div>
              {lines.length > 0 && (
                <pre
                  className="mt-2 max-h-48 overflow-auto rounded-lg bg-ui-bg-base-pressed p-2 txt-compact-xsmall font-mono text-ui-fg-subtle"
                  aria-live="polite"
                >
                  {lines.map((l) => l.message).join("\n")}
                </pre>
              )}
            </ModalForm>
          </FocusModal.Body>
        </FocusModal.Content>
      </FocusModal>
    </PageContainer>
  );
}

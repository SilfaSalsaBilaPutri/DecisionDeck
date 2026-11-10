export type DecisionStatus = "proposed" | "decided" | "superseded";

export interface DecisionListItem {
  id: string;
  title: string;
  context: string;
  decision_text: string;
  rationale: string;
  owner_name: string;
  decision_date: string;
  status: string;
  tags: string[];
}

export interface DecisionFilters {
  query: string;
  status: string;
  tag: string;
  owner: string;
  dateFrom: string;
  dateTo: string;
}

export function filterDecisions<T extends DecisionListItem>(
  decisions: T[],
  filters: DecisionFilters,
): T[] {
  const query = filters.query.trim().toLocaleLowerCase();
  const owner = filters.owner.trim().toLocaleLowerCase();

  return decisions.filter((decision) => {
    const matchesQuery =
      !query ||
      [decision.title, decision.context, decision.decision_text, decision.rationale, ...decision.tags]
        .join(" ")
        .toLocaleLowerCase()
        .includes(query);
    const matchesStatus = !filters.status || decision.status === filters.status;
    const matchesTag =
      !filters.tag || decision.tags.some((tag) => tag.toLocaleLowerCase() === filters.tag.toLocaleLowerCase());
    const matchesOwner = !owner || decision.owner_name.toLocaleLowerCase().includes(owner);
    const matchesDateFrom = !filters.dateFrom || decision.decision_date >= filters.dateFrom;
    const matchesDateTo = !filters.dateTo || decision.decision_date <= filters.dateTo;

    return (
      matchesQuery &&
      matchesStatus &&
      matchesTag &&
      matchesOwner &&
      matchesDateFrom &&
      matchesDateTo
    );
  });
}
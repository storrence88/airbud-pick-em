import { Check } from "lucide-react";
import { cn } from "#/lib/utils";
import type { Member } from "#/server/leagues";
import { Avatar } from "./Avatar";

/** A radio list of members, for the commissioner panels that act on one of them. */
export function MemberChoice({
	name,
	legend,
	members,
	value,
	onChange,
}: {
	name: string;
	legend: string;
	members: Member[];
	value: string | null;
	onChange: (userId: string) => void;
}) {
	return (
		<fieldset className="mt-4 grid gap-2">
			<legend className="sr-only">{legend}</legend>
			{members.map((m) => {
				const selected = m.user_id === value;
				return (
					<label
						key={m.user_id}
						className={cn(
							"flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2 transition-colors has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-ring/40",
							selected ? "border-primary bg-primary/5" : "hover:bg-muted",
						)}
					>
						<input
							type="radio"
							name={name}
							value={m.user_id}
							checked={selected}
							onChange={() => onChange(m.user_id)}
							className="sr-only"
						/>
						<Avatar profile={m} size={32} />
						<span className="min-w-0 flex-1">
							<span className="block truncate font-medium">
								{m.display_name}
							</span>
							{m.title && (
								<span className="block truncate text-xs text-muted-foreground">
									{m.title}
								</span>
							)}
						</span>
						<span
							className={cn(
								"grid size-5 shrink-0 place-items-center rounded-full border transition-colors",
								selected && "border-primary bg-primary text-primary-foreground",
							)}
							aria-hidden
						>
							{selected && <Check className="size-3.5" />}
						</span>
					</label>
				);
			})}
		</fieldset>
	);
}

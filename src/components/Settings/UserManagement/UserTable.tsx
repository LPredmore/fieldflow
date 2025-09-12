import { ReactNode } from 'react';
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface UserTableProps {
  children: ReactNode;
}

export function UserTable({ children }: UserTableProps) {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[40px]"></TableHead>
            <TableHead>User</TableHead>
            <TableHead>Role</TableHead>
            <TableHead className="w-[100px]">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {children}
        </TableBody>
      </Table>
    </div>
  );
}
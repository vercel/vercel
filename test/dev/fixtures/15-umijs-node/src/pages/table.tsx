import * as React from 'react';
import { RouterTypes } from 'umi';
import { Table, Divider, Tag, Popconfirm } from 'antd';
const { ColumnGroup } = Table;

type StringType = Record<'key' | 'firstName' | 'lastName' | 'address', string>;

interface IData extends StringType {
  age: number;
  tags: string[];
}

class Column extends Table.Column<IData> {}

const AntdTable: React.SFC<RouterTypes> = props => {
  const data = [
    {
      key: '1',
      firstName: 'John',
      lastName: 'Brown',
      age: 32,
      address: 'New York No. 1 Lake Park',
      tags: ['nice', 'developer'],
    },
    {
      key: '2',
      firstName: 'Jim',
      lastName: 'Green',
      age: 42,
      address: 'London No. 1 Lake Park',
      tags: ['loser'],
    },
    {
      key: '3',
      firstName: 'Joe',
      lastName: 'Black',
      age: 32,
      address: 'Sidney No. 1 Lake Park',
      tags: ['cool', 'teacher'],
    },
  ];
  return (
    <Table dataSource={data}>
      <ColumnGroup title="Name">
        <Column title="First Name" dataIndex="firstName" key="firstName" />
        <Column title="Last Name" dataIndex="lastName" key="lastName" />
      </ColumnGroup>
      <Column title="Age" dataIndex="age" key="age" />
      <Column title="Address" dataIndex="address" key="address" />
      <Column
        title="Tags"
        dataIndex="tags"
        key="tags"
        render={tags => (
          <span>
            {tags.map(tag => (
              <Tag color="blue" key={tag}>
                {tag}
              </Tag>
            ))}
          </span>
        )}
      />
      <Column
        title="Action"
        key="action"
        render={(text, record) => (
          <span>
            <a href="javascript:;">Invite {record.lastName}</a>
            <Divider type="vertical" />
            <Popconfirm title="Sure to delete?" onConfirm={() => {}}>
              <a href="javascript:;">Delete</a>
            </Popconfirm>
          </span>
        )}
      />
    </Table>
  );
};

export default AntdTable;

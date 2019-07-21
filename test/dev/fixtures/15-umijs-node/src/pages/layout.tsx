import * as React from 'react';
import { RouterTypes } from 'umi';
import router from 'umi/router';
import { Layout, Menu, Breadcrumb, Icon } from 'antd';

const { Header, Content, Footer, Sider } = Layout;
const SubMenu = Menu.SubMenu;

const AntdLayout: React.FC<RouterTypes> = props => {
  const { children } = props;
  const [collapsed, setCollapsed] = React.useState<boolean>(false);

  const onCollapse = (collapsed: boolean): void => {
    setCollapsed(collapsed);
  };

  const onMenuClick = ({ key }): void => {
    router.push(key);
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider collapsible collapsed={collapsed} onCollapse={onCollapse}>
        <div className="logo" />
        <Menu
          theme="dark"
          defaultSelectedKeys={[props.location.pathname]}
          mode="inline"
          onClick={onMenuClick}
        >
          <Menu.Item key="/">
            <Icon type="home" />
            <span>Home</span>
          </Menu.Item>
          <Menu.Item key="/form">
            <Icon type="form" />
            <span>Form</span>
          </Menu.Item>
          <Menu.Item key="/table">
            <Icon type="table" />
            <span>Table</span>
          </Menu.Item>
          <SubMenu
            key="sub1"
            title={
              <span>
                <Icon type="user" />
                <span>User</span>
              </span>
            }
          >
            <Menu.Item key="3">Tom</Menu.Item>
            <Menu.Item key="4">Bill</Menu.Item>
            <Menu.Item key="5">Alex</Menu.Item>
          </SubMenu>
          <SubMenu
            key="sub2"
            title={
              <span>
                <Icon type="team" />
                <span>Team</span>
              </span>
            }
          >
            <Menu.Item key="6">Team 1</Menu.Item>
            <Menu.Item key="8">Team 2</Menu.Item>
          </SubMenu>
        </Menu>
      </Sider>
      <Layout>
        <Header style={{ background: '#fff', padding: '0 16px' }}>Header</Header>
        <Content style={{ margin: '0 16px' }}>
          <Breadcrumb style={{ margin: '16px 0' }}>
            <Breadcrumb.Item>User</Breadcrumb.Item>
            <Breadcrumb.Item>Bill</Breadcrumb.Item>
          </Breadcrumb>
          <div style={{ padding: 24, background: '#fff', minHeight: 360 }}>{children}</div>
        </Content>
        <Footer style={{ textAlign: 'center' }}>Ant Design ©2018 Created by Ant UED</Footer>
      </Layout>
    </Layout>
  );
};

export default AntdLayout;
